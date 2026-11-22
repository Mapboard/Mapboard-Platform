# Database design — schema-based multi-tenancy

How Mapboard Platform stores all projects in a single PostgreSQL database, the metadata
registry that describes them, the schema-naming scheme, the PostGIS-topology coupling, and
the migration machinery that produced this state. For the broader system picture see
[architecture.md](architecture.md); this is the database reference.

## Overview

Mapboard originally ran **one PostgreSQL database per project**, with a flat `public.projects`
table mapping each project to its `database` / `data_schema` / `topo_schema`. That scaled
poorly (cluster management fanned out across many databases) and blocked cloud/K8s deployment.

The current model is **schema-based multi-tenancy**: a single `mapboard` database holds every
project. Three things live in it:

1. a **metadata registry** in the `mapboard` schema (`project` → `canvas` → `context`, plus a
   `project_schema` inventory);
2. each project's **owned schemas** — data, topology, and auxiliary — namespaced under an
   `mb_<slug>_<uuid8>_…` prefix;
3. a **read API** exposed by PostgREST over the `mapboard_api` views.

The flat `public.projects` table has been dropped; all code resolves through the registry.
Legacy per-project databases remain in the cluster (as cold backups) but are no longer reachable
from the application.

## The registry (`mapboard` schema)

Defined in `py-modules/cli/core-fixtures/01-schema.sql` and `01.5-project-schema.sql`.

```
mapboard.project ──1:N──▶ mapboard.canvas ──1:N──▶ mapboard.context
   │  slug (UNIQUE)          │  slug (UNIQUE per         name, slug (UNIQUE per
   │  uuid, title, srid      │    project), type          project), bounds, parent,
   │  main_context ──────────┼──▶ (map|cross-section)     is_public, offset_x/y
   │  derived_from           │  database, data_schema,
   │  owner_id               │    topo_schema, srid,
   │                         │    tolerance, legacy
   └─────────────────────────┴────────── mapboard.project_schema
                                          (inventory of every owned schema:
                                           project_id, canvas_id?, schema_name,
                                           source_name, kind)
```

- **`project`** — the top-level unit. `slug` is globally `UNIQUE` and is the public identity;
  `uuid` is the stable internal identity used in schema names. `main_context` points at the
  context that is a project's default view. `derived_from` recorded migration lineage and is
  `NULL` for all canonical projects (see [Migration](#migration-from-the-legacy-model)).
- **`canvas`** — a **mapping surface that owns a single PostGIS topology** and a data schema.
  A project has one canvas per mapping surface (e.g. naukluft has a `map` canvas and a
  `cross-section` canvas). `slug` is unique within the project (`UNIQUE(project_id, slug)`,
  length ≤ 24) and names the canvas segment of its schemas. In the target model every canvas
  has `database = 'mapboard'` and `legacy = false`.
- **`context`** — a named, bounded **view within a canvas** (a map area or a cross-section
  line). `slug` is unique per project. Contexts carry bounds, base-layer associations, and
  parent/child relationships; the frontend navigates `project → context`.
- **`project_schema`** — the inventory of **every non-system schema a project owns**, with a
  `kind` (`canvas_data` | `canvas_topo` | `auxiliary` | `base` | `api`) and an optional
  `canvas_id`. This is what makes arbitrary project-scoped schemas a first-class capability
  (enumerable for teardown, export, access control) rather than a naming convention.

### Uniqueness & reserved names

- `project.slug` — globally `UNIQUE`.
- `canvas.slug` — `UNIQUE(project_id, slug)`.
- `context.slug` — `UNIQUE(project_id, slug)`.
- **`mapboard` is reserved** as a project slug (it is the core schema and the `mb_` prefix
  root). Enforcement is currently at the application layer; a DB-level trigger is a TODO
  (a plain CHECK was removed because it fired on every UPDATE and blocked metadata maintenance).

## Project-owned schemas & naming

Every schema a project owns is named on **one unified scheme**
(`migrate_utils.project_schema_name`):

```
mb_<slug>_<project-uuid8>_<discriminator>[_<data|topo>]
```

so all of a project's schemas share the uniform, project-unique prefix `mb_<slug>_<uuid8>_`
(easy to enumerate / glob). The `<discriminator>` is the canvas `slug` for canvas schemas, the
source schema name for auxiliary schemas, or `base`.

| kind | example | contents |
|------|---------|----------|
| `canvas_data` | `mb_naukluft_2517c1e5_map_data` | linework, polygon, map_layer, types, stations |
| `canvas_topo` | `mb_naukluft_2517c1e5_map_topo` | the PostGIS topology (edge/node/face/relation) |
| `auxiliary` | `mb_naukluft_2517c1e5_mapping` | arbitrary project-scoped domain data (verbatim) |
| `base` | `mb_naukluft_2517c1e5_base` | project tables that lived in the source `public` schema |

Design points:

- **Identity is the project UUID.** The slug is a cosmetic hint (also stored as a
  `COMMENT ON SCHEMA`) and may be truncated; it can drift on rename without breaking anything.
- **Names are hard-capped under Postgres's 63-char identifier limit.** The cosmetic slug hint is
  truncated (≤ 16 chars); the discriminator is never silently truncated — an over-length name
  raises rather than risk a collision.
- **Data and topology are separate schemas by necessity** (next section).

## PostGIS topology coupling

Topology is the reason canvas data and topology are split, and why a canvas is the unit of
tenancy rather than a project:

- A PostGIS **topology is its own schema** (created by `topology.CreateTopology`) with
  `edge_data` / `node` / `face` / `relation` tables and a row in the per-database catalog
  `topology.topology`; each topogeometry column is registered in `topology.layer`. Topologies
  are single planar graphs — **un-shareable and un-mergeable** across projects.
- The `linework.topo` column is a **`TopoGeometry`** bound to exactly one topology/layer, with a
  `check_topogeom_topo` constraint pinning its `topology_id`. It therefore cannot be pooled into
  shared cross-project tables while retaining live topology.
- Consequently **topology is rebuilt per canvas, not copied.** After data lands, the
  topology-derived columns (`topo`, `geometry_hash`, `topology_error`) are reset and the
  topology re-established from the topology-manager fixtures.

**Catalog hygiene.** A bare `DROP SCHEMA … CASCADE` leaves `topology.topology` / `topology.layer`
rows behind (only `topology.DropTopology()` removes them). `migrate_utils.drop_unreferenced_topologies`
prunes both — `DropTopology()` when the schema still exists, direct catalog delete when it is gone
— and runs at the start of every migration and via `mapboard db cleanup`.

> **Status:** topology rebuild is currently **deferred** — migrated canvases carry their data with
> `topo` NULL, ready to be recomputed. Maps won't render resolved polygons until then.

## Read API (`mapboard_api` + PostgREST)

The `mapboard_api` schema (`core-fixtures/02.0-api.sql`, `02.1-api-transitional.sql`) exposes read
views — `project`, `context` (which surfaces `project_slug`/`uuid`, `canvas_slug`/`uuid`,
`context slug`/`uuid`, and the canvas's `data_schema`/`topo_schema`), `cross_sections`,
`cross_section_endpoints`, `piercing_points`, `stations` — consumed by PostgREST and the frontend.
Roles `web_anon` / `web_user` / `web_auth` (`03-roles.sql`) gate access. A future per-project API
surface (`<slug>_api` schemas + PostgREST profiles) is sketched in
[architecture.md](architecture.md#project-scoped-schemas--api-surfaces); the `project_schema`
`kind = 'api'` value is reserved for it.

## Migration from the legacy model

The legacy database-per-project data was carried across by a single primitive plus per-kind
reconciliation (`py-modules/cli/mapboard/cli/migrate_utils/`). Every step is **row-count verified**
and nothing source-side is silently dropped.

- **`clone_schema` / `clone_schema_as`** — verbatim structure+data clone via `pg_dump | pg_restore`.
  Schemas and tables are dumped in **separate passes** (mixing `--schema` and `--table` silently
  drops the schema selection), **tables first** so cross-schema FKs into a `public` table resolve.
  Identifiers are double-quoted (so dotted/edge-case names like `…0.0.4` are literal). The restore
  is **error-tolerant** (objects depending on intentionally-omitted schemas fail and are logged;
  row-count verification is the correctness check). `clone_schema_as` prefers a direct clone and
  falls back to a **temp-database staging** hop when the source schema name collides in the target
  (e.g. a source schema literally named `mapboard`).
- **Canvas** — clone the source data schema verbatim → verify clone fidelity → reconcile
  legacy column drift (e.g. `layer` → `map_layer`) → drop the topology-derived columns → re-sync
  the canonical topology via the topology-manager fixtures. Extra source tables/columns are
  preserved for later rather than dropped.
- **Auxiliary** — clone the science schemas as one group (preserving intra-group FKs) plus the
  `public` project tables (excluding the PostGIS catalog, OSM basemap, `*_bak`, and the core
  `projects`/`users` tables), then rename each into `mb_…` and gather the `public` tables into a
  `…_base_…` schema.
- **Promote to canonical** — `promote_migrated_projects` retires each legacy original's metadata
  (source databases untouched) and renames the derived `-copy` project to the canonical slug,
  clearing `derived_from`.

### Safety invariants

- **Only `mb_`-prefixed schemas are ever dropped** by the migration/delete paths
  (`_drop_migration_schema`). An interrupted copy can leave a canvas pointing at its *source*
  schema name (e.g. `mapboard`); refusing non-`mb_` drops prevents that from taking out a core
  schema.
- **The registry is snapshotted before every destructive run** (`snapshot_registry` →
  `$MAPBOARD_SNAPSHOT_DIR`, default `~/.mapboard/snapshots`) — it is small but irreplaceable (its
  UUIDs *name* every `mb_` schema).
- **Row-count parity gates every table copy**; a mismatch aborts loudly.

### CLI

```
mapboard db migrate-projects [--dry-run] [--delete] [--promote] [--project <slug>]
mapboard db cleanup      # prune orphaned topologies + orphaned mb_ schemas
mapboard schema plan     # diff the core schema (core-fixtures) against the database
mapboard schema apply    # apply the plan; `schema sync` re-applies views, functions, grants
```

`projects {list,create,drop}` and `core.database.project_params` / `get_topology_manager` (and the
topology worker's `project_params`) all resolve through the registry — a project slug maps to its
`main_context`'s canvas; the worker keys on `canvas.data_schema`.

## Deferred / future work

- **Topology rebuild** — recompute topology for migrated canvases (`topo` is NULL by design).
- **Per-project API surfaces** — `<slug>_api` schemas + PostgREST profiles (`kind = 'api'` reserved).
- **Reserved-name enforcement** — a `BEFORE INSERT OR UPDATE OF slug` trigger for `mapboard%`.
- **CriticalMAAS subsystem** — still queries the dropped `public.projects`; needs rewriting onto the
  registry.
- **Legacy databases** — the per-project source DBs remain in the cluster as backups; dropping them
  is a separate, deliberate step once the new model is fully exercised.

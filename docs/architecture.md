# Mapboard Platform — Architecture

This document describes the current architecture of the Mapboard Platform and the in-progress
transition from a **database-per-project** model to a **schema-based multi-tenant** model.
For the high-level cloud-readiness roadmap see [`Architectural transition.md`](./Architectural%20transition.md);
for day-to-day working conventions see [`../CLAUDE.md`](../CLAUDE.md).

## Overview

Mapboard Platform is a server-side system for creating and editing geologic maps. It is the
web/server counterpart to the Mapboard GIS iPad app. Its job is to store map linework and
metadata, iteratively resolve that linework into topologically consistent map-unit polygons,
and serve the result to a browser frontend and to mapping clients.

It orchestrates several components:

- **Topology manager** (`py-modules/topology-manager`, a git submodule of
  [postgis-geologic-map](https://github.com/davenquinn/postgis-geologic-map)): the PostGIS
  schemas and procedures that turn edited linework into space-filling polygons, wrapped in a
  Python module + CLI + "watcher" process.
- **Mapboard editing API** (`mapboard_server`): the closed-source HTTP API for editing,
  built from a separate source tree (`MAPBOARD_SERVER_SRC_DIR`).
- **PostgREST**: auto-generated REST API over the database's `mapboard_api` schema.
- **Frontend** (`mapboard-ui`): a Vike + React application.
- **Supporting services**: a Caddy reverse-proxy gateway and an elevation/DEM tiler.

The system currently runs **only locally**, via Docker Compose.

## Runtime topology (Docker Compose)

Defined in [`system/docker-compose.yaml`](../system/docker-compose.yaml), fronted by
[`system/Caddyfile`](../system/Caddyfile).

```
                         ┌─────────────────────────── gateway (Caddy, :8000) ───────────────────────────┐
  browser  ───────────▶  │  /*          → frontend (Vike/React, :3000)                                   │
                         │  /pg-api/*   → postgrest (:3000)   ── REST over the mapboard_api schema        │
                         │  /api/*      → mapboard_server (:8080)  ── closed-source editing API           │
                         │  /dem-tiles/*→ elevation_tiler (:8000)                                         │
                         └──────────────────────────────────┬───────────────────────────────────────────┘
                                                             │
                                                   database (postgis:15-3.4)
                                                   single cluster, volume db_cluster
```

| Service | Image / source | Role |
|---------|----------------|------|
| `gateway` | `caddy:2` | Reverse proxy + CORS + TLS (internal certs). Single public port `:8000`. |
| `database` | `postgis/postgis` | The PostgreSQL cluster. Currently allows password-less connections (local convenience). |
| `postgrest` | `postgrest/postgrest` | Exposes schema `mapboard_api`, anon role `web_anon`. |
| `elevation_tiler` | `elevation-tiler` | Serves DEM tiles from `data/`. |
| `mapboard_server` | built from `MAPBOARD_SERVER_SRC_DIR` | Closed-source editing/topology API (`production` profile). |
| `frontend` | `mapboard-ui/` | Vike SSR app; talks to the gateway URLs above. |

Commented-out `broker` (Redis) and worker services anticipate the task-worker architecture
described in the roadmap (step 2).

## Backend Python workspace

`pyproject.toml` defines a **uv workspace**; each member under `py-modules/*` is an installable
package sharing one virtualenv (`.venv`). The `mapboard` CLI is the operational entry point
(`bin/mapboard`).

### `mapboard.cli` (`py-modules/cli`)
The Typer CLI. Command groups are assembled in `mapboard/cli/__init__.py`:

- `projects` — create / list / drop / copy / dump / export projects, reset topology
  (`projects.py`).
- `db` — init fixtures, generate/apply migrations, run stored SQL procedures, `psql`,
  dump/dump-cluster, **`migrate-projects`** (the multi-tenant migration), `cleanup`
  (`database.py`).
- `topo` — topology management, delegated to the submodule's CLI.
- `ops`, `ingest`, `move-unit`, `test`, plus `cross-sections` and `criticalmaas` subsystems.

Supporting assets in this package:
- `core-fixtures/*.sql` — the **core (`mapboard`/`mapboard_api`) schema**, roles, and the
  `copy_project_metadata` migration function. Applied by `mapboard db init`.
- `fixtures/*.sql` — per-project/canvas data-table fixtures applied by `apply_fixtures`.
- `migrate_utils/` — the legacy→multi-tenant migration (see [The migration mechanism](#the-migration-mechanism-mapboard-db-migrate-projects)).
- `migrations/` (repo root) and `procedures/` — ad-hoc SQL run via `mapboard db run`.
- `mobile_export/` — export a project to the mobile app's format.

### `mapboard.core` (`py-modules/core`)
Cross-cutting glue:
- `settings.py` — `connection_string(...)`, the module-level `core_db` (→ `mapboard` DB),
  `.env` loading, image/SRID config.
- `database.py` — `project_params`, `setup_database`, `get_topology_manager`.
  **These still read the legacy flat `projects` table** (see [Data model](#data-model--legacy-vs-target)).
- `workers/topology.py` — an async loop that listens for linework changes and drives topology
  updates through `TopologyManager`; also reads the legacy `projects` table.
- `task_runner/` — hook for the Celery-based task system.

### `mapboard.topology-manager` (submodule)
The PostGIS topology engine. Key concept: `create_context(...)` builds a `TopologyContext`
parameterized by `data_schema`, `topo_schema`, `srid`, `tolerance`, plus configurable
`identity_strategy`, `boundary_table`, and data-table creation (see the submodule's
`AGENTS.md`). The resulting `instance_params` drive SQL templating (`{data_schema}`,
`{topo_schema}`, `{topo_name}`, …) used throughout fixtures and procedures.

### `mapboard.tasks` (`py-modules/tasks`)
Celery app + Redis broker scaffolding for offloading imports and topology processing to
workers (roadmap step 2). Not yet wired into the default stack.

### `mapboard.cross-sections`, `mapboard.api`
Cross-section subsystem (fixtures + procedures) and a currently-empty API stub.

## Data model — legacy vs. target

> **See [database-design.md](database-design.md)** for the authoritative, detailed treatment of
> the schema-based multi-tenant model (registry, schema naming, PostGIS-topology coupling, the
> migration machinery, and safety invariants). This section is a summary.

The migration to the multi-tenant model is **complete**: all projects live in the single
`mapboard` database and the flat `projects` table has been retired.

### Legacy: database-per-project
Historically, **each project got its own PostgreSQL database**. A flat `projects` table
(queried in `core/database.py`, `workers/topology.py`, `projects.py:list_projects`) mapped a
project `slug` to its `database`, `data_schema`, and `topo_schema`. Cluster-level management
(backups, migrations, connections) had to fan out across many databases — the scaling problem
motivating this migration.

### Target: schema-based multi-tenant
All projects live in a **single `mapboard` database**. Metadata is normalized into the
`mapboard` schema (defined in `core-fixtures/01-schema.sql`):

```
mapboard.project ──1:N──▶ mapboard.canvas ──1:N──▶ mapboard.context
        │                        │                        (named regions / views:
        │ main_context           │ owns data_schema +      map or cross-section,
        └────────────────────────┘ topo_schema, srid,      bounds, base layers)
                                    tolerance, legacy flag
```

- **`project`** — top-level unit (`slug`, `uuid`, `title`, `srid`, `owner`, optional
  `derived_from` for migration lineage, `main_context`).
- **`canvas`** — a mapping surface that shares a single topology. Carries a `slug`
  (unique within the project — `UNIQUE(project_id, slug)`), `database`, `data_schema`,
  `topo_schema`, `srid`, `tolerance`, and a `legacy` flag. In the target model every canvas has
  `database = 'mapboard'` and its own pair of schemas within that database.
- **`context`** — a named, bounded view within a canvas (e.g. a map area or a cross-section),
  with bounds, base-layer associations, and public/parent relationships.
- **`project_schema`** (`core-fixtures/01.5-project-schema.sql`) — the inventory of *every*
  non-system schema a project owns in the merged database, with a `kind`
  (`canvas_data` / `canvas_topo` / `auxiliary` / `base` / `api`) and an optional `canvas_id`.
  This is what makes **arbitrary project-scoped schemas** a first-class capability rather than
  a naming convention (see [Project-scoped schemas & API surfaces](#project-scoped-schemas--api-surfaces)).

A project therefore owns more than its canvases. A real project like *naukluft* also carries
**auxiliary** domain schemas (geochemistry, stratigraphic sections, field data). Each such source
schema is preserved **one-to-one** — it becomes its own target schema with all of its tables,
views, and constraints intact; nothing is merged. The only exception is the source database's
`public` schema: the project tables that lived loose there (with no schema of their own) are
collected into a single **base** schema.

**Schema naming.** Every schema a project owns is named on one unified scheme
(`migrate_utils.project_schema_name`):

```
mb_<slug>_<project-uuid8>_<discriminator>[_<data|topo>]
```

so all of a project's schemas share the uniform, project-unique prefix `mb_<slug>_<uuid8>_`
(easy to enumerate/`glob`). The `<discriminator>` is the canvas `slug` for canvas schemas, the
source schema name for auxiliary schemas, or `base`. **Identity is the project UUID** — the slug
is a cosmetic hint (also stored as a `COMMENT ON SCHEMA`) and may be truncated; the discriminator
is not, and names are hard-capped under Postgres's 63-char identifier limit (an over-length name
raises rather than silently colliding). Uniqueness is enforced upstream too: `project.slug` is
globally `UNIQUE` and each `canvas.slug` is unique within its project.

The **`mapboard_api`** schema (`core-fixtures/02.0-api.sql`) exposes read views
(`mapboard_api.project`, `mapboard_api.context`, …) that PostgREST and the frontend consume.
Roles `web_anon` / `web_user` / `web_auth` (`03-roles.sql`) gate access.

### Transitional state (important)
The migration is **partially implemented on the `multi-tenant` branch**:

- Uses the **new** model: `migrate_utils`, `core-fixtures/*.sql`, the `mapboard_api` views,
  and the frontend (which already navigates `project → context` and reads `database` /
  `data_schema` / `topo_schema` off each context).
- Still uses the **legacy** flat `projects` table: `core/database.py` (`project_params`,
  `setup_database`, `get_topology_manager`), `core/workers/topology.py`, and
  `cli/projects.py` (`list_projects`, `create_project`).

Reconciling these legacy paths onto `mapboard.project/canvas/context` is the main remaining
work of the migration.

## The migration mechanism (`mapboard db migrate-projects`)

Implemented in `cli/migrate_utils/__init__.py`. For each legacy project not yet derived:

1. **Clone metadata** into the new model via the SQL function
   `mapboard.copy_project_metadata(source_project)` (`core-fixtures/04-copy-project-metadata.sql`),
   which copies the project + its canvases + contexts, preserving relationships and stamping
   `derived_from`.
2. **For each canvas**, assign a per-project-unique canvas `slug` (defaulted from the canvas
   type) and compute schema names with `project_schema_name` on the unified scheme
   `mb_<slug>_<project-uuid8>_<discriminator>[_<data|topo>]` (see below), create the new
   `data_schema`/`topo_schema`, apply fixtures (`apply_fixtures`), and register both in
   `project_schema`.
3. **Copy the canvas data** by explicit matching column name (`copy_schema_data` — never
   `SELECT *`, since source/target columns are the same set in a different order). A cross-database
   source is staged through a **transient** `postgres_fdw` `import` schema that is dropped
   afterwards (no leftover cruft).
4. **Migrate auxiliary schemas** (`migrate_auxiliary_schemas`): a single scoped
   `pg_dump | pg_restore` (`move_tables`) carries the project's non-canvas schemas + its `public`
   project tables in one pass, preserving structure, data, and cross-schema foreign keys. Then:
   - **each source schema is renamed one-to-one** into `mb_<slug>_<uuid8>_<source>` — e.g.
     naukluft's `mapping` (19 tables + matviews) → `mb_naukluft_<uuid8>_mapping`, `carbon_isotopes`
     → `mb_naukluft_<uuid8>_carbon_isotopes`, whole and intact (only the schema *name* changes);
   - the loose `public` project tables are gathered into one `mb_<slug>_<uuid8>_base`.

   Foreign keys follow the renames (they bind to table identity, not schema name), so references
   between the migrated schemas — and into `base` — stay valid. Every schema is registered in
   `project_schema`. System/derived schemas (`*_topology`, rasters, OSM basemap, `*_bak`) are
   excluded. *Caveat:* a view/matview inside a migrated schema that reads from an **excluded**
   schema will fail to restore (its tables still arrive); watch the restore log and handle such
   cases individually. A related gap — schema names embedded as text in **function/view bodies**
   (notably the canvas `map_digitizer`→`map_data` / `map_topology`→`map_topo` renames) aren't
   always rewritten — is tracked in [`migration-notes.md`](./migration-notes.md).
5. **Reset topology columns** (`topo`, `geometry_hash`, `topology_error`) on the copied linework
   so topology can be rebuilt separately (topology rebuild is deferred).
6. **Update the `mapboard.canvas` record** to point at `database = 'mapboard'` and the new
   schemas, clearing the `legacy` flag.

Companion commands: `--dry-run` (`plan_projects`) reports what would move, changing nothing;
`--delete` (`delete_migrated_projects`) tears down derived projects and their schemas; `mapboard
db cleanup` drops topologies no longer referenced by any canvas (`drop_unreferenced_topologies`).

## Project-scoped schemas & API surfaces

> **Status: design sketch (not yet implemented).** The `project_schema` registry and `mb_*`
> naming exist; per-project API schemas do not. This section records the intended shape so the
> pieces added now (`kind = 'api'` is reserved in the registry) stay forward-compatible. To be
> explored further.

Because a project owns a registered set of namespaced schemas ([Data model](#data-model--legacy-vs-target)), a project can also expose a
**public API surface** — the same pattern the platform already uses internally, where
`mapboard_api` is a schema of views over `mapboard.*` consumed by PostgREST. Applied per project,
a `naukluft_api` schema would hold views/functions over that project's `mb_naukluft_*` data, base,
and auxiliary schemas. The API schema is the **stable contract**: its views shield clients from the
uuid-keyed internal schema names (which can change), exactly as `mapboard_api` shields them from
`mapboard.*`.

How it wires into the current design:

- **Registry.** An API schema is one more `project_schema` row, `kind = 'api'`. Unlike internal
  schemas (uuid-keyed for rename-safety), an API schema takes a **clean, public name** — the slug,
  `"<slug>_api"` — because that name is its public identity (it appears in the URL / PostgREST
  profile). Renaming the project renames the API surface, which is acceptable.
- **PostgREST exposure.** Serve multiple schemas from the single PostgREST instance via schema
  **profiles**: set `PGRST_DB_SCHEMAS=mapboard_api,naukluft_api,…` (the first is the default) in
  `system/docker-compose.yaml`; the anon role needs `USAGE`/`SELECT` on each (the `03-roles.sql`
  pattern). `NOTIFY pgrst, 'reload schema'` (already used by `db refresh-postgrest`) applies changes
  live. A dedicated PostgREST container per project is the heavier alternative, warranted only when a
  project needs its own auth/roles.
- **Custom API prefix (Caddy).** One dynamic rule maps `/api/projects/<slug>/…` to the right schema by
  capturing the slug and injecting the profile header — no per-project config:

  ```
  @proj path_regexp proj ^/api/projects/([^/]+)/
  handle @proj {
    uri strip_prefix /api/projects/{re.proj.1}
    reverse_proxy postgrest:3000 {
      header_up Accept-Profile  {re.proj.1}_api
      header_up Content-Profile {re.proj.1}_api
    }
  }
  ```

- **Registry → config.** The only value that must track the registry is `PGRST_DB_SCHEMAS`
  (PostgREST has no wildcard). A generator over `project_schema WHERE kind = 'api'` can emit it and
  reload — e.g. a future `mapboard db refresh-api` — keeping the registry the single source of truth.
- **Access control.** Public exposure makes grants explicit: per-project `GRANT`s (or per-project
  roles for the dedicated-instance route), with the `mapboard.context.is_public` flag / row-level
  security governing what anonymous callers can read, and writes requiring an authenticated role.

Net effect on the migration work is additive and small: a reserved `kind`, a clean-name branch in
`project_schema_name`, a `create_project_api(project)` step, a `refresh-api` command, and the one
Caddy rule. Nothing about the data migration changes — the API layer sits atop the `mb_*` schemas it
produces.

## Frontend (`mapboard-ui`)

- **Stack:** Vike (`vike` + `vike-react`) on Vite 6 / React 18, TypeScript, served by a custom
  Express entry (`server/express-entry.ts`). Yarn 4 with PnP. Mapping via MapLibre GL / Mapbox
  GL plus Macrostrat UI packages; state via Zustand + Jotai; Blueprint.js UI kit.
- **Routing** is file-based under `pages/`, with the core app at
  `pages/projects/@slug/@context/…` — the active **project slug** and **context slug** drive
  every downstream API call.
- **Data access** goes through the gateway:
  - `/pg-api/*` — PostgREST, via `@supabase/postgrest-js` (`shared/utils/api-client.ts`,
    the singleton `postgrest` client and `useResult`/`usePGResult` hooks). Map data is also
    fetched as GeoJSON directly from PostgREST endpoints (e.g. `stations.geojson?project_id=eq…`).
  - `/api/*` — the `mapboard_server` topology API (project/context topology, dev tooling,
    `openapi.json`).
  - **WebSocket** `/topology/changes` (`change-watcher.ts`) pushes topology-change events that
    trigger map/cross-section reloads.
- **Types are generated** from the backend OpenAPI schema
  (`scripts/generate-types.ts` → `shared/types/project-api.ts`); don't hand-edit.
- The domain model in the UI is already **project → context**, and multi-tenancy is expressed
  through each context's `database` / `data_schema` / `topo_schema` fields — consistent with
  the target backend model.

## Cloud-readiness roadmap

From [`Architectural transition.md`](./Architectural%20transition.md):

1. **Multi-tenant migration** — replace database-per-project with schema-based tenancy
   (the current focus — see [Data model](#data-model--legacy-vs-target) and [The migration mechanism](#the-migration-mechanism-mapboard-db-migrate-projects)).
2. **Topology efficiency & task workers** — move topology updates onto a broker/worker
   architecture (the `tasks` module + commented-out Redis/worker services).
3. **Kubernetes** — prepare the system to run in K8s.

### Known hardening items before cloud deployment
- Password-less Postgres connections and `NODE_TLS_REJECT_UNAUTHORIZED=0` in the frontend are
  local-only conveniences and must be removed/replaced with real auth + certs.
- A Mapbox token is present in local frontend config; ensure secrets are externalized.
- Legacy code paths must be fully migrated off the flat `projects` table (see [Data model](#data-model--legacy-vs-target)) before the
  database-per-project assumptions are removed.

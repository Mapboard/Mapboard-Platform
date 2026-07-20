# Mapboard Platform — Architecture

This document describes the current architecture of the Mapboard Platform and the in-progress
transition from a **database-per-project** model to a **schema-based multi-tenant** model.
For the high-level cloud-readiness roadmap see [`Architectural transition.md`](./Architectural%20transition.md);
for day-to-day working conventions see [`../CLAUDE.md`](../CLAUDE.md).

## 1. Overview

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

## 2. Runtime topology (Docker Compose)

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

## 3. Backend Python workspace

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
- `migrate_utils/` — the legacy→multi-tenant migration (see §5).
- `migrations/` (repo root) and `procedures/` — ad-hoc SQL run via `mapboard db run`.
- `mobile_export/` — export a project to the mobile app's format.

### `mapboard.core` (`py-modules/core`)
Cross-cutting glue:
- `settings.py` — `connection_string(...)`, the module-level `core_db` (→ `mapboard` DB),
  `.env` loading, image/SRID config.
- `database.py` — `project_params`, `setup_database`, `get_topology_manager`.
  **These still read the legacy flat `projects` table** (see §4).
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

## 4. Data model — legacy vs. target

This is the crux of the current work.

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
- **`canvas`** — a mapping surface that shares a single topology. Carries `database`,
  `data_schema`, `topo_schema`, `srid`, `tolerance`, and a `legacy` flag. In the target model
  every canvas has `database = 'mapboard'` and its own pair of schemas within that database.
- **`context`** — a named, bounded view within a canvas (e.g. a map area or a cross-section),
  with bounds, base-layer associations, and public/parent relationships.
- **`project_schema`** (`core-fixtures/01.5-project-schema.sql`) — the inventory of *every*
  non-system schema a project owns in the merged database, with a `kind`
  (`canvas_data` / `canvas_topo` / `auxiliary` / `base` / `api`) and an optional `canvas_id`.
  This is what makes **arbitrary project-scoped schemas** a first-class capability rather than
  a naming convention (see §6).

A project therefore owns more than its canvases. A real project like *naukluft* also carries
**auxiliary** domain schemas (geochemistry, stratigraphic sections, field data) and project data
that lived in the source database's `public` schema (collected into a single **base** schema).
Every owned schema is namespaced and grouped under an `mb_<slug>_…` prefix (§5).

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

## 5. The migration mechanism (`mapboard db migrate-projects`)

Implemented in `cli/migrate_utils/__init__.py`. For each legacy project not yet derived:

1. **Clone metadata** into the new model via the SQL function
   `mapboard.copy_project_metadata(source_project)` (`core-fixtures/04-copy-project-metadata.sql`),
   which copies the project + its canvases + contexts, preserving relationships and stamping
   `derived_from`.
2. **For each canvas**, compute target schema names with `target_schema_name`
   (`mb_<slug>_<canvastype>_<data|topo>_<canvas-uuid8>` — grouped per-map, keyed on the stable
   canvas UUID), create the new `data_schema`/`topo_schema`, apply fixtures (`apply_fixtures`),
   and register both in `project_schema`.
3. **Copy the canvas data** by explicit matching column name (`copy_schema_data` — never
   `SELECT *`, since source/target columns are the same set in a different order). A cross-database
   source is staged through a **transient** `postgres_fdw` `import` schema that is dropped
   afterwards (no leftover cruft).
4. **Migrate auxiliary schemas** (`migrate_auxiliary_schemas`): a single scoped
   `pg_dump | pg_restore` (`move_tables`) carries the project's non-canvas schemas + its `public`
   project tables — preserving structure, data, and intra-project cross-schema foreign keys —
   which are then renamed into `mb_<slug>_<source>_<project-uuid8>` (a `…_base_…` schema for the
   `public` data) and registered. System/derived schemas (`*_topology`, rasters, OSM, `*_bak`)
   are excluded.
5. **Reset topology columns** (`topo`, `geometry_hash`, `topology_error`) on the copied linework
   so topology can be rebuilt separately (topology rebuild is deferred).
6. **Update the `mapboard.canvas` record** to point at `database = 'mapboard'` and the new
   schemas, clearing the `legacy` flag.

Companion commands: `--dry-run` (`plan_projects`) reports what would move, changing nothing;
`--delete` (`delete_migrated_projects`) tears down derived projects and their schemas; `mapboard
db cleanup` drops topologies no longer referenced by any canvas (`drop_unreferenced_topologies`).

## 6. Project-scoped schemas & API surfaces

> **Status: design sketch (not yet implemented).** The `project_schema` registry and `mb_*`
> naming exist; per-project API schemas do not. This section records the intended shape so the
> pieces added now (`kind = 'api'` is reserved in the registry) stay forward-compatible. To be
> explored further.

Because a project owns a registered set of namespaced schemas (§4), a project can also expose a
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

## 7. Frontend (`mapboard-ui`)

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

## 8. Cloud-readiness roadmap

From [`Architectural transition.md`](./Architectural%20transition.md):

1. **Multi-tenant migration** — replace database-per-project with schema-based tenancy
   (the current focus; §4–§5).
2. **Topology efficiency & task workers** — move topology updates onto a broker/worker
   architecture (the `tasks` module + commented-out Redis/worker services).
3. **Kubernetes** — prepare the system to run in K8s.

### Known hardening items before cloud deployment
- Password-less Postgres connections and `NODE_TLS_REJECT_UNAUTHORIZED=0` in the frontend are
  local-only conveniences and must be removed/replaced with real auth + certs.
- A Mapbox token is present in local frontend config; ensure secrets are externalized.
- Legacy code paths must be fully migrated off the flat `projects` table (§4) before the
  database-per-project assumptions are removed.

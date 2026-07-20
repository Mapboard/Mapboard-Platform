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
   (`z_<uuid8>_<slug>_<contexttype>_<data|topo>`), create the new `data_schema`/`topo_schema`
   in the `mapboard` database, and apply fixtures (`apply_fixtures`).
3. **Copy the data.** If the source is already in the `mapboard` database, copy schema→schema
   directly (`copy_schema_data`). If it's a *different* database (the legacy case), stand up a
   `postgres_fdw` foreign server and `IMPORT FOREIGN SCHEMA` into a temp schema
   (`foreign_schema.py`), then copy from there.
4. **Reset topology columns** (`topo`, `geometry_hash`, `topology_error`) on the copied
   linework so topology can be rebuilt cleanly.
5. **Update the `mapboard.canvas` record** to point at `database = 'mapboard'` and the new
   schemas, clearing the `legacy` flag.

Companion commands: `--delete` (`delete_migrated_projects`) tears down migrated schemas and
metadata; `mapboard db cleanup` drops topologies no longer referenced by any canvas
(`drop_unreferenced_topologies`).

## 6. Frontend (`mapboard-ui`)

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

## 7. Cloud-readiness roadmap

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

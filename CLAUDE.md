# CLAUDE.md

Guidance for working in the **Mapboard Platform** repository. Read this first, then
`docs/architecture.md` for the deeper picture and the current multi-tenant migration.

## What this is

Mapboard Platform is the server-side orchestration layer for the **Mapboard** geologic
map editing system. It ties together:

- the open-source [topology manager](https://github.com/davenquinn/postgis-geologic-map)
  (PostGIS-based; vendored as a git submodule at `py-modules/topology-manager`),
- the closed-source Mapboard editing API (`mapboard_server`, built from a separate source tree),
- a PostgREST data API, a Caddy gateway, an elevation tiler, and a Vike/React frontend.

Today it runs **only locally via Docker Compose** (`system/docker-compose.yaml`). The
active goal is to make it deployable to cloud infrastructure (eventually K8s). See
`docs/Architectural transition.md` for the roadmap.

## Repository layout

| Path | What it is |
|------|-----------|
| `py-modules/` | A **uv workspace** of Python packages (see `pyproject.toml` → `[tool.uv.workspace]`). |
| `py-modules/cli` | `mapboard.cli` — the **Typer CLI**, main operational entry point. SQL fixtures, migrations, ops. |
| `py-modules/core` | `mapboard.core` — settings, DB connection helpers, topology worker/event loop. |
| `py-modules/topology-manager` | `mapboard.topology-manager` — PostGIS topology engine (git submodule; has its own `AGENTS.md`). |
| `py-modules/tasks` | `mapboard.tasks` — Celery/Redis background task scaffolding. |
| `py-modules/cross-sections` | `mapboard.cross-sections` — cross-section subsystem (Naukluft). |
| `py-modules/api` | `mapboard.api` — currently an empty stub. |
| `migrations/` | Migration modules for `mapboard schema migrate`; `legacy/` holds hand-run SQL for `mapboard db run`. |
| `system/` | `docker-compose.yaml` + `Caddyfile` (reverse proxy). |
| `mapboard-ui/` | Frontend: Vike + React + Vite, talks to PostgREST. Uses Yarn 4 (PnP). |
| `bin/mapboard` | Launcher that activates `.venv` and runs the CLI. |
| `.env` | Local config (Postgres creds, ports, tokens). Not committed values-wise but present locally. |

## Environment & commands

- Tooling versions are pinned in `.mise.toml` (Python 3.12, Node 20, Poetry 2). Python deps
  are managed with **uv** (`uv.lock`); the CLI runs from `.venv`.
- The CLI is invoked as `mapboard <command>` via `bin/mapboard` (symlink it with `make install`).
- `mapboard --help` lists command groups. Key ones:
  - `mapboard projects {list,create,drop,copy,dump,export,reset-topology}` — project lifecycle.
  - `mapboard schema {plan,review,apply,sync,migrate,provision,graph}` — the core schema (see below).
  - `mapboard env`, `mapboard config` — choose and show the environment.
  - `mapboard db {init,migrate-projects,run,psql,dump,dump-cluster,cleanup,disconnect}` — database ops.
  - `mapboard topo ...` — topology management (delegates to the submodule CLI).
  - `mapboard ops ...`, `mapboard ingest`, `mapboard test` — misc/ingest/test.
- Start the stack: `docker compose -f system/docker-compose.yaml up` (from a context where `.env` is loaded).
- **Environments** come from `mapboard.toml` (gitignored; copy `mapboard.example.toml`),
  via `macrostrat.app_frame.environments`: `--env <name>`, `mapboard env <name>`, else `local`.
  `[local]` without `database` falls back to `.env`'s `POSTGRES_*`.
  Each `database` is a **superuser**; the CLI works as `mapboard` (`APP_OWNER`), applying
  schema changes under `SET ROLE` and connecting otherwise with `options=-crole=mapboard`.
- **Core schema** is declarative (`macrostrat.schema_management`): chunks in
  `py-modules/cli/mapboard/cli/schema.py` over `core-fixtures/`. `mapboard schema plan` diffs it
  against the database in a scratch container (Docker) and writes `_plans/<env>.plan.sql`
  (gitignored); `apply` runs the plan; `sync` re-applies views/functions/grants. Project schemas (`mb_*`) are outside it, built per canvas
  by `mapboard db init <project>`. The transitional `mapboard_api` views and `public.photo_note`
  read one project's schemas, so they are kept out of diffs (`UNMANAGED_VIEWS`).
  Plans never create roles or grants: on a new database, `mapboard schema provision --target
  grants` creates `mapboard` and grants it what it needs, and `mapboard schema migrate`
  (`app-owner`) re-owns anything another role built.

## Data model — READ THIS before touching project/DB code

The platform is **mid-migration** between two models. Getting this wrong is the easiest way
to break things.

- **Legacy model (being retired):** one PostgreSQL *database per project*. A flat `projects`
  table records each project and its `database` / `data_schema` / `topo_schema`.
- **Target model (this branch's goal): schema-based multi-tenancy.** A single `mapboard`
  database holds *all* projects. Metadata lives in the `mapboard` schema as
  `mapboard.project` → `mapboard.canvas` → `mapboard.context`; each **canvas** owns its own
  `data_schema` + `topo_schema` inside the one database. PostgREST reads from the
  `mapboard_api.*` views.

**The transition is incomplete.** New code paths (`mapboard.cli.migrate_utils`, the
`core-fixtures/*.sql`, the `mapboard_api` views, and the frontend) use the new
`project/canvas/context` model, but several older code paths still query the legacy flat
`projects` table:

- `py-modules/core/mapboard/core/database.py` → `project_params` / `setup_database` / `get_topology_manager`
- `py-modules/core/mapboard/core/workers/topology.py` → `project_params`
- `py-modules/cli/mapboard/cli/projects.py` → `list_projects`, `create_project`

When you change project/DB plumbing, check *which* model a function targets and keep the two
consistent (or migrate the legacy path). `mapboard db migrate-projects` performs the data
migration; `docs/architecture.md` documents its mechanics.

## Conventions & gotchas

- **SQL templating:** `Database.run_sql` substitutes `{data_schema}`, `{topo_schema}`,
  `{topo_name}`, etc. from `instance_params`, set by `create_context` / `set_params`
  (see topology-manager `config.py`). Pass identifiers as `psycopg2.sql.Identifier`, never
  string-formatted, to avoid injection and quoting bugs.
- **Schema names** for a project's schemas are generated by `migrate_utils.project_schema_name`
  on one unified scheme: `mb_<slug>_<project-uuid8>_<discriminator>[_<data|topo>]` (canvas
  schemas use the canvas `slug` as discriminator; auxiliary schemas the source name; `base` for
  project data from the source `public`). Every schema a project owns shares the
  `mb_<slug>_<uuid8>_` prefix. Identity is the project UUID; names are hard-capped under
  Postgres's 63-char limit (over-length raises). Don't hand-craft these.
- **Cross-database copies** during migration use `postgres_fdw` (`migrate_utils/foreign_schema.py`).
- **Connection strings**: `admin_database_url()` is the selected environment's database (else
  `MAPBOARD_DATABASE_URL`, else `.env`), as the connecting role; `database_url()` is the same
  acting as `mapboard` when the CLI has set that role. `core_db` connects to it lazily.
  `connection_string(...)` is for other databases on the local server (the legacy
  per-project ones). Respect `container_internal` when code runs inside vs. outside Docker.
- **Frontend** hits two REST surfaces via the gateway: `/pg-api/*` (PostgREST, the main data
  layer, via `@supabase/postgrest-js`) and `/api/*` (the `mapboard_server` topology API), plus
  a WebSocket at `/topology/changes` for live topology updates. API TypeScript types are
  **generated** from the OpenAPI schema (`mapboard-ui/scripts/generate-types.ts`) — regenerate
  rather than hand-editing `shared/types/project-api.ts`.
- **Security note (local dev):** the frontend `.env` sets `NODE_TLS_REJECT_UNAUTHORIZED=0`
  (for OrbStack self-signed certs) and Postgres allows password-less connections. These are
  local-only conveniences that must be hardened before any cloud deployment.

## Related docs

- `docs/architecture.md` — full architecture + multi-tenant migration details.
- `docs/Architectural transition.md` — the three-step cloud-readiness roadmap.
- `py-modules/topology-manager/AGENTS.md` and `README.md` — the topology engine internals.

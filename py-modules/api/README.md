# Mapboard API

The platform API: ORCID sign-in, per-project access, and background task runs.
It issues the session token. The closed-source `mapboard_server` and PostgREST
each verify that token themselves with the shared `SECRET_KEY`, and look up
project access in the database.

The gateway serves these under `/api` (`/api/auth/…`, `/api/tasks/…`) and strips
the prefix, so `REDIRECT_URI` ends in `/api/auth/callback`.

- `/auth/login`, `/auth/callback`, `/auth/refresh`, `/auth/logout`, `/auth/me` —
  from `macrostrat.auth_system.session`. The session cookie is also a PostgREST
  JWT, so the `mapboard_api` views show a visitor only the projects they may read.
- `/auth/access/{project}` — the visitor's access level.
- `/tasks/topology/{project}` — `POST` queues a topology rebuild (editors),
  `GET` lists recent runs; `/tasks/runs/{id}` returns one run with its log.

Access is stored in `mapboard.project_member` and `mapboard.project.is_public`
(`core-fixtures/01.6-access.sql`) and managed with `mapboard access`.

Run it with `uvicorn --factory mapboard.api.app:default_app`. Settings come from
the environment: `MAPBOARD_DATABASE_URL`, `SECRET_KEY`, `OAUTH_CLIENT_ID`,
`OAUTH_CLIENT_SECRET`, `REDIRECT_URI`, `CELERY_BROKER_URL`. Tokens carry the
audience `mapboard` (`JWT_AUDIENCE`), which the server and PostgREST require. Without an OAuth
client, sign-in answers 503 and public projects stay readable.

Tests: `pytest py-modules/api/tests` (uses a throwaway database on the local
Postgres).

"""Mapboard's platform API: sign-in, access levels, and task runs.

It issues the session token; mapboard_server and PostgREST verify it themselves.

Run with: uvicorn --factory mapboard.api.app:default_app
"""

import logging
import secrets
from os import environ

from fastapi import FastAPI, HTTPException, Request
from macrostrat.auth_system.session import (
    AuthSettings,
    SessionReader,
    create_auth_router,
)
from macrostrat.database import Database
from starlette.concurrency import run_in_threadpool

from .store import MapboardStore
from .tasks import create_tasks_router

log = logging.getLogger("uvicorn.error")


def auth_settings_from_env() -> tuple[AuthSettings, bool]:
    """Settings, and whether sign-in is possible. Read access works without it."""
    configured = bool(environ.get("OAUTH_CLIENT_ID") and environ.get("SECRET_KEY"))
    overrides = {}
    if not environ.get("SECRET_KEY"):
        log.warning("SECRET_KEY is not set; sessions will not outlive this process")
        overrides["secret_key"] = secrets.token_urlsafe(32)
    if not configured:
        overrides.setdefault("oauth_client_id", environ.get("OAUTH_CLIENT_ID", ""))
        overrides.setdefault(
            "oauth_client_secret", environ.get("OAUTH_CLIENT_SECRET", "")
        )
    if not environ.get("JWT_AUDIENCE"):
        # mapboard_server and PostgREST refuse tokens issued for anything else.
        overrides["audience"] = "mapboard"
    if not environ.get("REDIRECT_URI"):
        overrides["redirect_uri"] = "http://localhost:8000/auth/callback"
    return AuthSettings.from_env(**overrides), configured


def create_app(
    db: Database, settings: AuthSettings, *, login_enabled: bool = True, transport=None
) -> FastAPI:
    app = FastAPI(title="Mapboard platform API")
    store = MapboardStore(db)
    reader = SessionReader(settings)

    if login_enabled:
        app.include_router(create_auth_router(settings, store, transport=transport))
    else:

        @app.get("/auth/login")
        async def login_unavailable():
            raise HTTPException(503, "Sign-in is not configured on this server")

        @app.get("/auth/me")
        async def anonymous():
            raise HTTPException(401, "Not authenticated")

    @app.get("/auth/access/{project}")
    async def project_access(project: str, request: Request):
        """What the visitor may do in a project, for the UI to show or hide editing."""
        session = reader.read(request)
        sub = session.sub if session else None
        exists, access = await run_in_threadpool(store.project_access, project, sub)
        if not exists or access is None:
            raise HTTPException(404, "Project not found")
        return {"project": project, "access": access}

    app.include_router(create_tasks_router(store, reader))
    return app


def default_app() -> FastAPI:
    from mapboard.core.settings import core_db

    settings, configured = auth_settings_from_env()
    return create_app(core_db, settings, login_enabled=configured)

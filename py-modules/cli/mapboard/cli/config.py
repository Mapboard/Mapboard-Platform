"""Mapboard's environments, from `mapboard.toml` and `MAPBOARD_*` variables."""

from collections.abc import Mapping
from os import environ

from macrostrat.app_frame import Environments
from mapboard.core.settings import MAPBOARD_ROOT, set_database_url_provider
from sqlalchemy.engine import URL

DEFAULTS = {
    # Plans are built on the local stack's image; the dev cluster also runs PG15.
    "planning_image": environ.get("POSTGRES_IMAGE") or "postgis/postgis:15-3.4",
}


# Built at import, before the command line is parsed, so `--env` is seen.
environments = Environments.for_command_line(
    "mapboard",
    search=[MAPBOARD_ROOT],
    defaults=DEFAULTS,
    # Fetched afresh where an environment asks to reauthorize a write.
    credentials=["database"],
)

# Nothing chosen: use `local` if the file defines it, keeping any other choice explicit.
if environments.env is None and "local" in environments.available():
    environ[environments.env_var] = "local"
    environments.reload()


def setting_url(key: str):
    """The URL a database setting describes, fetching any secret in it now"""
    settings = environments.settings
    database = settings.get(key)
    if database is None:
        return None
    if not isinstance(database, Mapping):
        return settings.secret(key)
    # A table, when the stored credential names the unreachable in-cluster host.
    url = URL.create(
        "postgresql",
        username=database.get("user"),
        password=database.secret("password"),
        host=database.get("host"),
        port=database.get("port") or 5432,
        database=database.get("dbname") or "mapboard",
    )
    return url.render_as_string(hide_password=False)


# Resolved on first connection, so commands that never connect fetch nothing.
set_database_url_provider(lambda: setting_url("database"))

"""Mapboard's environments, from `mapboard.toml` and `MAPBOARD_*` variables."""

from os import environ

from macrostrat.app_frame import Environments
from mapboard.core.settings import MAPBOARD_ROOT, set_database_url_provider

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


def _database_url():
    # Resolved on first connection, so commands that never connect fetch nothing.
    if environments.settings.get("database") is None:
        return None
    return environments.settings.secret("database")


set_database_url_provider(_database_url)

"""Mapboard's environments, from `mapboard.toml` and `MAPBOARD_*` variables."""

from base64 import b64decode
from collections.abc import Mapping
from os import environ
from shutil import which
from subprocess import run

from macrostrat.app_frame import Environments
from macrostrat.app_frame.secrets import SecretResolutionError, register_resolver
from mapboard.core.settings import MAPBOARD_ROOT, set_database_url_provider
from sqlalchemy.engine import URL

DEFAULTS = {
    # Plans are built on the local stack's image; the dev cluster also runs PG15.
    "planning_image": environ.get("POSTGRES_IMAGE") or "postgis/postgis:15-3.4",
}


def resolve_kubernetes(body: str) -> str:
    """`k8s://<namespace>/<secret>/<key>`: one key of a cluster Secret"""
    try:
        namespace, name, key = body.strip().split("/", 2)
    except ValueError:
        raise SecretResolutionError(
            f"k8s://{body} should name k8s://<namespace>/<secret>/<key>."
        )
    # Tiger's API server is reached through the VPN proxy that `tigr` wraps.
    kubectl = "tigr" if which("tigr") else "kubectl"
    jsonpath = "{.data." + key.replace(".", "\\.") + "}"
    proc = run(
        [kubectl, "get", "secret", name, "-n", namespace, "-o", f"jsonpath={jsonpath}"],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0 or not proc.stdout:
        raise SecretResolutionError(
            f"Could not read {key!r} from secret {namespace}/{name} with {kubectl}: "
            + (proc.stderr.strip() or "no such key")
        )
    return b64decode(proc.stdout).decode()


register_resolver("k8s", resolve_kubernetes)

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
    settings = environments.settings
    database = settings.get("database")
    if database is None:
        return None
    if not isinstance(database, Mapping):
        return settings.secret("database")
    # A table, for credentials stored apart from the host they are used through.
    url = URL.create(
        "postgresql",
        username=database.get("user"),
        password=database.secret("password"),
        host=database.get("host"),
        port=database.get("port") or 5432,
        database=database.get("dbname") or "mapboard",
    )
    return url.render_as_string(hide_password=False)


set_database_url_provider(_database_url)

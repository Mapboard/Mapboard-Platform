from os import environ
from pathlib import Path
from typing import Callable, Optional

from dotenv import load_dotenv
from macrostrat.database import Database
from sqlalchemy.engine import make_url

root = Path(__file__).parent.parent.parent.parent

# For some reason, environment variables aren't loading correctly
# using the app_frame module. Or maybe, env vars set there
# aren't available outside of module code.
MAPBOARD_ROOT = environ.get("MAPBOARD_ROOT", root)
if MAPBOARD_ROOT is not None:
    MAPBOARD_ROOT = Path(MAPBOARD_ROOT)
    load_dotenv(MAPBOARD_ROOT / ".env")


def connection_string(database: str, container_internal: bool = False):
    """A URL on the local Docker Compose server, which also holds the legacy databases"""
    user = environ.get("POSTGRES_USER") or "postgres"
    password = environ.get("POSTGRES_PASSWORD") or "postgres"
    if container_internal:
        port = 5432
        host = "database"
    else:
        port = environ.get("MAPBOARD_DB_PORT") or 54398
        host = environ.get("POSTGRES_HOST") or "localhost"

    return f"postgresql://{user}:{password}@{host}:{port}/{database}"


# Set by the CLI to the selected environment's database.
_url_provider: Optional[Callable[[], Optional[str]]] = None


def set_database_url_provider(provider: Callable[[], Optional[str]]):
    global _url_provider
    _url_provider = provider


def database_url(database: Optional[str] = None) -> str:
    """URL of the Mapboard database, or of another database on the same server"""
    url = None
    if _url_provider is not None:
        url = _url_provider()
    if url is None:
        url = environ.get("MAPBOARD_DATABASE_URL")
    if url is None:
        return connection_string(database or "mapboard")
    # SQLAlchemy 2 rejects the `postgres://` scheme that libpq clients accept.
    if url.startswith("postgres://"):
        url = "postgresql://" + url.removeprefix("postgres://")
    if database is None:
        return url
    return make_url(url).set(database=database).render_as_string(hide_password=False)


POSTGRES_IMAGE = environ.get("POSTGRES_IMAGE") or "postgis/postgis:13-3.1"


class _LazyDatabase:
    """Connects on first use, after the CLI has chosen an environment."""

    def __init__(self):
        object.__setattr__(self, "_db", None)

    def _get(self) -> Database:
        if self._db is None:
            object.__setattr__(self, "_db", Database(database_url()))
        return self._db

    def __getattr__(self, name):
        return getattr(self._get(), name)

    def __setattr__(self, name, value):
        setattr(self._get(), name, value)


core_db: Database = _LazyDatabase()

from os import environ
from pathlib import Path

from dotenv import load_dotenv
from macrostrat.database import Database

root = Path(__file__).parent.parent.parent.parent

# For some reason, environment variables aren't loading correctly
# using the app_frame module. Or maybe, env vars set there
# aren't available outside of module code.
MAPBOARD_ROOT = environ.get("MAPBOARD_ROOT", root)
if MAPBOARD_ROOT is not None:
    MAPBOARD_ROOT = Path(MAPBOARD_ROOT)
    load_dotenv(MAPBOARD_ROOT / ".env")


def connection_string(database: str, container_internal: bool = False):
    """Get a connection string for a given database"""
    user = environ.get("POSTGRES_USER") or "postgres"
    password = environ.get("POSTGRES_PASSWORD") or "postgres"
    if container_internal:
        port = 5432
        host = "database"
    else:
        port = environ.get("MAPBOARD_DB_PORT") or 54398
        host = environ.get("POSTGRES_HOST") or "localhost"

    return f"postgresql://{user}:{password}@{host}:{port}/{database}"


POSTGRES_IMAGE = environ.get("POSTGRES_IMAGE") or "postgis/postgis:13-3.1"

core_db = Database(connection_string("mapboard"))

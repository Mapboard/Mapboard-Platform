from os import environ
from pathlib import Path

from dotenv import load_dotenv
from macrostrat.database import Database

MAPBOARD_CLI_ROOT = Path(__file__).parent
MAPBOARD_ROOT = MAPBOARD_CLI_ROOT.parent.parent.parent


# For some reason, environment variables aren't loading correctly
# using the app_frame module. Or maybe, env vars set there
# aren't available outside of module code.
load_dotenv(MAPBOARD_ROOT / ".env")
# Could probably manage this within the application config.


def connection_string(database: str, container_internal: bool = False):
    """Get a connection string for a given database"""
    POSTGRES_USER = environ.get("POSTGRES_USER") or "postgres"
    POSTGRES_PASSWORD = environ.get("POSTGRES_PASSWORD") or "postgres"
    if container_internal:
        PORT = 5432
        HOST = "database"
    else:
        PORT = environ.get("MAPBOARD_DB_PORT") or 54398
        HOST = environ.get("POSTGRES_HOST") or "localhost"

    return f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{HOST}:{PORT}/{database}"


POSTGRES_IMAGE = environ.get("POSTGRES_IMAGE") or "postgis/postgis:13-3.1"

core_db = Database(connection_string("mapboard"))

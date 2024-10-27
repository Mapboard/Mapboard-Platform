from pathlib import Path

from macrostrat.app_frame.compose import console
from macrostrat.database import Database as BaseDatabase
from macrostrat.database.utils import create_database, database_exists
from mapboard.topology_manager.commands import _create_tables
from mapboard.topology_manager.database import Database
from psycopg2.sql import Literal

from .settings import core_db


def create_core_fixtures():
    """Create fixtures for the core mapboard database"""
    console.print("Creating fixtures in core database...")
    if not database_exists(core_db.engine.url):
        create_database(core_db.engine.url)
    apply_core_fixtures(core_db)
    # Reload Postgrest
    core_db.run_query("SELECT pg_notify('pgrst', 'reload schema')")


def apply_core_fixtures(db: BaseDatabase):
    fixtures = Path(__file__).parent.parent.parent / "core-fixtures"
    files = list(fixtures.rglob("*.sql"))
    files.sort()
    for fixture in files:
        db.run_sql(fixture)


def apply_fixtures(
    database: Database,
):
    _create_tables(database)
    database.instance_params["tms_srid"] = Literal(3857)

    fixtures = Path(__file__).parent / "fixtures"
    files = list(fixtures.rglob("*.sql"))
    files.sort()
    for fixture in files:
        console.print(fixture)
        database.run_sql(fixture)

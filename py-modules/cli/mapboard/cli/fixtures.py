from pathlib import Path

from .application import console
from macrostrat.database import Database
from macrostrat.database.utils import create_database, database_exists
from mapboard.topology_manager import TopologyManager
from psycopg.sql import Literal

from mapboard.core.settings import core_db


def create_core_fixtures():
    """Create fixtures for the core mapboard database"""
    console.print("Creating fixtures in core database...")
    if not database_exists(core_db.engine.url):
        create_database(core_db.engine.url)
    apply_core_fixtures(core_db)
    # Reload Postgrest
    core_db.run_sql("SELECT pg_notify('pgrst', 'reload schema')")


def apply_core_fixtures(db: Database):
    fixtures = Path(__file__).parent.parent.parent / "core-fixtures"
    files = list(fixtures.rglob("*.sql"))
    files.sort()
    for fixture in files:
        db.run_sql(fixture)


def apply_fixtures(
    mgr: TopologyManager,
):
    mgr.create_tables()
    mgr.database.instance_params["tms_srid"] = Literal(3857)

    fixtures = Path(__file__).parent / "fixtures"
    files = list(fixtures.rglob("*.sql"))
    files.sort()
    for fixture in files:
        console.print(fixture)
        mgr.database.run_sql(fixture)

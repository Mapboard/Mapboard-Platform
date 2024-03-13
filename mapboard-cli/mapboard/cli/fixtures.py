from pathlib import Path
from typing import Optional

from macrostrat.app_frame.compose import console
from macrostrat.database import Database
from macrostrat.database.utils import create_database, database_exists
from psycopg2.sql import SQL, Identifier, Literal

from .settings import core_db


def create_core_fixtures():
    """Create fixtures for the core mapboard database"""
    console.print("Creating fixtures in core database...")
    if not database_exists(core_db.engine.url):
        create_database(core_db.engine.url)
    apply_core_fixtures(core_db)
    # Reload Postgrest
    core_db.run_query("SELECT pg_notify('pgrst', 'reload schema')")


def apply_core_fixtures(db: Database):
    fixtures = Path(__file__).parent.parent.parent / "core-fixtures"
    files = list(fixtures.rglob("*.sql"))
    files.sort()
    for fixture in files:
        db.run_sql(fixture)


def apply_fixtures(database: Database, srid: Optional[int] = 4326):
    fixtures = Path(__file__).parent / "fixtures" / "server"
    files = list(fixtures.rglob("*.sql"))
    files.sort()
    for fixture in files:
        database.run_sql(
            fixture,
            params=dict(
                data_schema=Identifier("mapboard"),
                topo_schema=Identifier("map_topology"),
                cache_schema=Identifier("mapboard_cache"),
                index_prefix=SQL("mapboard"),
                srid=Literal(srid),
                tms_srid=Literal(3857),
            ),
        )

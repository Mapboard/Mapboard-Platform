from pathlib import Path

from .application import console
from macrostrat.database import Database
from mapboard.topology_manager import TopologyManager
from psycopg.sql import Literal



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

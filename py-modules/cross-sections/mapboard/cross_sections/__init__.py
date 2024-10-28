from typer import Typer
from pathlib import Path

from mapboard.core.database import setup_database

app = Typer(name="cross-sections", no_args_is_help=True)

fixtures = Path(__file__).parent / "fixtures"
procedures = Path(__file__).parent / "procedures"


@app.command(name="update")
def cross_sections():
    """
    Create fixtures for the cross-sections
    """
    db = setup_database("naukluft-cross-sections")
    db.run_fixtures(fixtures)


@app.command(name="get-terrain")
def get_terrain():
    """
    Update the topography of the cross-sections
    """

    db = setup_database("naukluft-cross-sections")

    proc = procedures / "update-topography.sql"
    db.run_sql(proc)

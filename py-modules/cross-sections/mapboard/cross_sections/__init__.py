from typer import Typer
from pathlib import Path

from mapboard.core.database import setup_database

app = Typer(name="cross-sections", no_args_is_help=True)

fixtures = Path(__file__).parent / "fixtures"


@app.command(name="cross-sections")
def cross_sections():
    db = setup_database("naukluft_cross_sections")
    db.run_fixtures(fixtures)

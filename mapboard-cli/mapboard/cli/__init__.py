from typer import Context
from pathlib import Path
from macrostrat.database import Database
from typer.main import get_command
from os import environ
from .core import app, cli, _compose, console

POSTGRES_USER = environ.get("POSTGRES_USER") or "postgres"
POSTGRES_PASSWORD = environ.get("POSTGRES_PASSWORD") or "postgres"
POSTGRES_DB = environ.get("POSTGRES_DB") or "postgres"
MAPBOARD_DB_PORT = environ.get("MAPBOARD_DB_PORT") or 54391
DATABASE_URL=f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@localhost:{MAPBOARD_DB_PORT}/{POSTGRES_DB}"

@app.command()
def create_fixtures(ctx: Context):
    """Create database fixtures"""
    console.print(f"Creating fixtures in database [cyan bold]{POSTGRES_DB}[/]...")
    fixtures = Path(__file__).parent/"fixtures"/"server"
    files = list(fixtures.rglob("*.sql"))
    db = Database(DATABASE_URL)
    for fixture in files:
        db.run_sql(fixture)

cli = get_command(app)
cli.add_command(_compose, "compose")
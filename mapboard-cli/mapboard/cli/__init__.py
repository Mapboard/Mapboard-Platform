import sys
from pathlib import Path
from macrostrat.database import Database, run_sql
from macrostrat.dinosaur import create_migration
from typer.main import get_command
from os import environ
import pytest

from psycopg2.sql import Identifier, Literal, SQL
from .core import app, cli, _compose, console
from .definitions import MAPBOARD_ROOT

POSTGRES_USER = environ.get("POSTGRES_USER") or "postgres"
POSTGRES_PASSWORD = environ.get("POSTGRES_PASSWORD") or "postgres"
POSTGRES_DB = environ.get("POSTGRES_DB") or "postgres"
MAPBOARD_DB_PORT = environ.get("MAPBOARD_DB_PORT") or 54391
DATABASE_URL = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@localhost:{MAPBOARD_DB_PORT}/{POSTGRES_DB}"


@app.command()
def test(args: list[str] = []):
    """Run mapboard-server tests"""

    testdir = MAPBOARD_ROOT / "mapboard-server"

    pytest.main([str(testdir), *args])


@app.command()
def create_fixtures():
    """Create database fixtures"""
    console.print(f"Creating fixtures in database [cyan bold]{POSTGRES_DB}[/]...")
    print(DATABASE_URL)
    db = Database(DATABASE_URL)
    apply_fixtures(db)


def apply_fixtures(database: Database):
    fixtures = Path(__file__).parent / "fixtures" / "server"
    files = list(fixtures.rglob("*.sql"))
    for fixture in files:
        database.run_sql(
            fixture,
            params=dict(
                data_schema=Identifier("mapboard"),
                topo_schema=Identifier("map_topology"),
                cache_schema=Identifier("mapboard_cache"),
                index_prefix=SQL("mapboard"),
                srid=Literal(32733),
                tms_srid=Literal(3857),
            ),
        )


@app.command()
def migrate(apply: bool = False, allow_unsafe: bool = False):
    """Migrate the Mapboard database to the latest version"""
    db = Database(DATABASE_URL)
    uri = db.engine.url._replace(database="mapboard_temp_migrate")
    migration = create_migration(
        db,
        apply_fixtures,
        target_url=uri,
        safe=not allow_unsafe,
        redirect=sys.stderr,
    )
    statements = list(migration.changes_omitting_views())
    n_statements = len(statements)
    if not allow_unsafe:
        statements = [stmt for stmt in statements if "drop" not in stmt.lower()]
    n_pruned = len(statements)
    if n_pruned < n_statements:
        console.print(f"Ignored {n_statements - n_pruned} unsafe statements")

    console.print("===MIGRATION BELOW THIS LINE===")
    for stmt in statements:
        if not allow_unsafe and "drop" in stmt.lower():
            continue
        if apply:
            run_sql(db.session, stmt)
        else:
            print(stmt, file=sys.stdout)


cli = get_command(app)
cli.add_command(_compose, "compose")

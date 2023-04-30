import sys
from pathlib import Path
from macrostrat.database import Database, run_sql
from macrostrat.dinosaur import create_migration, temp_database
from typer.main import get_command
from typing import Optional
from os import environ
import pytest
import click

from psycopg2.sql import Identifier, Literal, SQL
from .core import app, cli, _compose, console
from .definitions import MAPBOARD_ROOT

POSTGRES_USER = environ.get("POSTGRES_USER") or "postgres"
POSTGRES_PASSWORD = environ.get("POSTGRES_PASSWORD") or "postgres"
POSTGRES_DB = environ.get("POSTGRES_DB") or "postgres"
MAPBOARD_DB_PORT = environ.get("MAPBOARD_DB_PORT") or 54391
DATABASE_URL = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@localhost:{MAPBOARD_DB_PORT}/{POSTGRES_DB}"


@app.command()
def create_fixtures():
    """Create database fixtures"""
    console.print(f"Creating fixtures in database [cyan bold]{POSTGRES_DB}[/]...")
    print(DATABASE_URL)
    db = Database(DATABASE_URL)
    srid = environ.get("MAPBOARD_SRID")
    if srid is not None:
        srid = int(srid)
    apply_fixtures(db, srid=srid)


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


@click.command(
    "test",
    context_settings=dict(
        ignore_unknown_options=True,
        help_option_names=[],
        max_content_width=160,
        # Doesn't appear to have landed in Click 7? Or some other reason we can't access...
        # short_help_width=160,
    ),
)
@click.argument("args", nargs=-1, type=click.UNPROCESSED)
def test(args=[]):
    """Run mapboard-server tests"""
    testdir = MAPBOARD_ROOT / "mapboard-server"
    test_database = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@localhost:{MAPBOARD_DB_PORT}/mapboard_test_database"
    environ.update({"TESTING_DATABASE": test_database})

    with temp_database(test_database) as engine:
        db = Database(engine.url)
        print(engine.url)
        apply_fixtures(db)
        pytest.main([str(testdir), *args])


cli = get_command(app)
cli.add_command(_compose, "compose")
cli.add_command(test, "test")

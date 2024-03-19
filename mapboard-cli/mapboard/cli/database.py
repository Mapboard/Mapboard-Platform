import sys
from os import environ
from subprocess import run
from sys import stdin
from typing import Optional

from macrostrat.app_frame.compose import console
from macrostrat.database import Database, run_sql
from macrostrat.database.transfer.utils import raw_database_url
from macrostrat.dinosaur import create_migration
from macrostrat.utils.shell import run
from sqlalchemy import text
from typer import Context, Typer

from .fixtures import apply_core_fixtures, apply_fixtures, create_core_fixtures
from .settings import connection_string, core_db

db_app = Typer(name="db", no_args_is_help=True)


@db_app.command("init")
def create_fixtures(project: Optional[str] = None):
    """Create database fixtures"""
    if project is None:
        return create_core_fixtures()
    database = project

    console.print(f"Creating fixtures in database [cyan bold]{database}[/]...")
    DATABASE_URL = connection_string(database)
    db = Database(DATABASE_URL)
    srid = environ.get("MAPBOARD_SRID")
    if srid is not None:
        srid = int(srid)
    apply_fixtures(db, srid=srid)


def get_srid(db: Database) -> Optional[int]:
    return db.session.execute(
        text("SELECT Find_SRID('mapboard', 'linework', 'geometry')")
    ).scalar()


@db_app.command(
    context_settings={"allow_extra_args": True, "ignore_unknown_options": True}
)
def psql(ctx: Context, database: Optional[str] = None):
    """Run psql in the database container"""
    _database = database or "mapboard"
    DATABASE_URL = connection_string(_database)

    flags = [
        "-i",
        "--rm",
        "--network",
        "host",
    ]
    if len(ctx.args) == 0 and stdin.isatty():
        flags.append("-t")

    run("docker", "run", *flags, "postgres:15", "psql", DATABASE_URL, *ctx.args)


@db_app.command()
def migrate(
    database: Optional[str] = None, apply: bool = False, allow_unsafe: bool = False
):
    """Migrate a Mapboard project database to the latest version"""
    if database is None:
        database = "mapboard"
        db = core_db
        _apply_fixtures = lambda _db: apply_core_fixtures(_db)
    else:
        DATABASE_URL = connection_string(database)
        db = Database(DATABASE_URL)
        srid = get_srid(db)
        _apply_fixtures = lambda _db: apply_fixtures(_db, srid=srid)

    console.print(f"Migrating database [cyan bold]{database}[/]...")

    uri = db.engine.url._replace(database="mapboard_temp_migrate")
    migration = create_migration(
        db,
        _apply_fixtures,
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
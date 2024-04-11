import sys
from os import environ
from pathlib import Path
from subprocess import run
from sys import stdin
from typing import Optional

from macrostrat.app_frame.compose import console
from macrostrat.database import run_sql
from macrostrat.database.transfer.utils import raw_database_url
from macrostrat.dinosaur import create_migration
from macrostrat.utils.shell import run
from mapboard.topology_manager.database import Database
from sqlalchemy import text
from typer import Argument, Context, Option, Typer

from .fixtures import apply_core_fixtures, apply_fixtures, create_core_fixtures
from .settings import connection_string, core_db

db_app = Typer(name="db", no_args_is_help=True)


@db_app.command("init")
def create_fixtures(
    project: Optional[str] = None,
):
    """Create database fixtures"""
    if project is None:
        return create_core_fixtures()

    console.print(f"Creating fixtures for project [cyan bold]{project}[/]...")
    db = setup_database(project)
    apply_fixtures(db)


def get_srid(db: Database, schema="mapboard") -> Optional[int]:
    return db.session.execute(
        text("SELECT Find_SRID(:schema, :table, 'geometry')"),
        dict(schema=schema, table="linework"),
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


@db_app.command(name="run")
def run_procedure(project: str, name: Optional[str] = Argument(None)):
    """Run a predefined stored procedure in a project database.
    If no name is provided, list available procedures."""
    proc_dir = Path(__file__).parent.parent.parent.parent / "migrations"
    if name is None:
        console.print("[bold]Available procedures:")
        for proc in proc_dir.glob("*.sql"):
            console.print(proc.stem)
        return

    proc = proc_dir / f"{name}.sql"

    db = setup_database(project)
    db.run_fixtures(proc)


def project_params(project: str):
    res = core_db.run_query(
        "SELECT database, data_schema, topo_schema, srid, tolerance FROM projects WHERE slug = :slug",
        dict(slug=project),
    ).one()
    print(res)
    return dict(
        database=res.database,
        data_schema=res.data_schema,
        topo_schema=res.topo_schema,
        srid=res.srid,
        tolerance=res.tolerance,
    )


def setup_database(project: str) -> Database:
    params = project_params(project)
    DATABASE_URL = connection_string(params["database"])
    db = Database(DATABASE_URL)
    db.set_params(env={}, **params)
    return db


@db_app.command()
def migrate(
    project: Optional[str] = Argument(None),
    apply: bool = False,
    allow_unsafe: bool = False,
):
    """Migrate a Mapboard project database to the latest version"""
    if project is None:
        project = "mapboard"
        database = "mapboard"
        db = core_db
        _apply_fixtures = lambda _db: apply_core_fixtures(_db)
    else:
        params = project_params(project)
        database = params.pop("database")
        DATABASE_URL = connection_string(database)
        db = Database(DATABASE_URL)
        _apply_fixtures = lambda _db: apply_fixtures(Database(_db.engine.url), **params)

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

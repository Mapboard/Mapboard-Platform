import sys
from pathlib import Path
from subprocess import run
from sys import stdin
from typing import Optional
from rich.console import Console
from datetime import datetime

from macrostrat.database import run_sql
from macrostrat.database.transfer import pg_dump_to_file
from macrostrat.dinosaur import create_migration
from macrostrat.utils.shell import run

from mapboard.core.database import get_topology_manager
from mapboard.topology_manager.database import Database
from sqlalchemy import text
from typer import Argument, Context, Option, Typer

from mapboard.topology_manager import TopologyManager, create_context
from .fixtures import apply_core_fixtures, apply_fixtures, create_core_fixtures
from mapboard.cli.migrate_utils import pg_dump_cluster
from mapboard.core.settings import connection_string, core_db
from mapboard.core.database import project_params, setup_database
import asyncio
from .application import console

db_app = Typer(name="db", no_args_is_help=True)


@db_app.command("init")
def create_fixtures(
    project: Optional[str] = None,
):
    """Create database fixtures, either for the core database or a specific project"""
    if project is None:
        create_core_fixtures()
        return

    # TODO: this needs to be removed since all projects will be in the same schema...
    console.print(f"Creating fixtures for project [cyan bold]{project}[/]...")
    mgr = get_topology_manager(project)
    apply_fixtures(mgr)


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
    proc_dir = Path(__file__).parent.parent.parent.parent.parent / "migrations"
    if name is None:
        console.print("[bold]Available procedures:")
        for proc in proc_dir.glob("*.sql"):
            console.print(proc.stem)
        return

    proc = proc_dir / f"{name}.sql"

    db = setup_database(project)
    db.run_fixtures(proc)


@db_app.command()
def migrate(
    project: Optional[str] = Argument(None),
    apply: bool = False,
    allow_unsafe: bool = False,
):
    """Migrate a Mapboard project database to the latest version"""

    console = Console(file=sys.stderr)
    if project is None:
        project = "mapboard"
        database = "mapboard"
        db = core_db
        _apply_fixtures = lambda _db: apply_core_fixtures(_db)
    else:
        params = project_params(project)
        database = params.pop("database")
        mgr = get_topology_manager(project)
        db = mgr.database

        def _apply_fixtures(_db):
            ctx = create_context(database=_db, **params)
            mgr1 = TopologyManager(ctx)
            apply_fixtures(mgr1)

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
            run_sql(db.engine, stmt)
        else:
            print(stmt, file=sys.stdout)


@db_app.command()
def disconnect(project: Optional[str] = None):
    """Disconnect from a project database"""
    if project is None:
        db = core_db
    else:
        mgr = get_topology_manager(project)
        db = mgr.database
    db.run_sql(
        """
        SELECT *, pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE pid <> pg_backend_pid()
        AND datname = current_database()

        """
    )


@db_app.command()
def dump(project: str, dumpfile: Optional[Path] = None):
    """Dump a Mapboard project database to a file"""
    if project == "mapboard" or project == "-":
        project = "mapboard"
        db = core_db
    else:
        mgr = get_topology_manager(project)
        db = mgr.database

    if dumpfile is None:
        date_string = datetime.now().strftime("%Y-%m-%d")
        dumpfile = Path(f"{project}-{date_string}.pg-dump")

    task = pg_dump_to_file(db.engine, dumpfile)
    asyncio.run(task)


@db_app.command()
def dump_cluster(
    dump_dir: Path = Argument(
        ...,
        help="Directory to store the database dumps",
    ),
    user: str = Option(
        "postgres",
        help="Database user",
    ),
    postgres_container: str = Option(
        "postgres:15",
        help="Postgres container image",
    ),
):
    """Dump all databases in the Mapboard cluster to a directory"""
    engine = core_db.engine
    task = pg_dump_cluster(
        engine,
        dump_dir=dump_dir,
        user=user,
        postgres_container=postgres_container,
    )
    asyncio.run(task)


@db_app.command()
def migrate_projects(delete: bool = False, dry_run: bool = False):
    """Migrate all legacy projects to the multi-schema setup.

    --dry-run  Report what would be migrated (reads only, changes nothing).
    --delete   Remove previously-migrated (derived) projects and their schemas.
    """
    from mapboard.cli.migrate_utils import migrate_projects as _migrate_projects
    from mapboard.cli.migrate_utils import (
        delete_migrated_projects as _delete_migrated_projects,
        plan_projects as _plan_projects,
    )

    db = core_db

    if dry_run:
        _plan_projects(db)
    elif delete:
        _delete_migrated_projects(db)
    else:
        _migrate_projects(db)


@db_app.command()
def cleanup():
    """Clean up unused database objects"""

    from .migrate_utils import drop_unreferenced_topologies

    drop_unreferenced_topologies(core_db)

from pathlib import Path
from subprocess import run
from sys import stdin
from typing import Optional
from datetime import datetime

from macrostrat.database.transfer import pg_dump_to_file
from macrostrat.utils.shell import run

from mapboard.core.database import get_topology_manager
from mapboard.topology_manager.database import Database
from sqlalchemy import text
from typer import Argument, Context, Option, Typer

from .fixtures import apply_fixtures
from mapboard.cli.migrate_utils import pg_dump_cluster
from mapboard.core.settings import MAPBOARD_ROOT, admin_database_url, core_db
from mapboard.core.database import project_params, setup_database
import asyncio
from .application import console

db_app = Typer(name="db", no_args_is_help=True)


@db_app.command("init")
def create_fixtures(project: str):
    """Create a project's tables. The core schema is managed with `mapboard schema`."""
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
    DATABASE_URL = admin_database_url(database)

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
    proc_dir = MAPBOARD_ROOT / "migrations" / "legacy"
    if name is None:
        console.print("[bold]Available procedures:")
        for proc in proc_dir.glob("*.sql"):
            console.print(proc.stem)
        return

    proc = proc_dir / f"{name}.sql"

    db = setup_database(project)
    db.run_fixtures(proc)


@db_app.command()
def disconnect(project: Optional[str] = None):
    """Disconnect from a project database"""
    database = None
    if project is not None:
        database = project_params(project)["database"]
    # Ending other roles' sessions needs the connecting role's privileges.
    db = Database(admin_database_url(database))
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
    engine = Database(admin_database_url()).engine
    task = pg_dump_cluster(
        engine,
        dump_dir=dump_dir,
        user=user,
        postgres_container=postgres_container,
    )
    asyncio.run(task)


@db_app.command()
def migrate_projects(
    delete: bool = False,
    dry_run: bool = False,
    promote: bool = False,
    project: Optional[str] = Option(
        None, help="Limit to a single project by slug (e.g. --project provo)."
    ),
):
    """Migrate all legacy projects to the multi-schema setup.

    --project  Limit to one project by slug (migrate/delete/plan/promote just that one).
    --dry-run  Report what would be migrated (reads only, changes nothing).
    --delete   Remove previously-migrated (derived) projects and their schemas.
    --promote  Promote derived (-copy) projects to canonical (retire legacy originals).
    """
    from mapboard.cli.migrate_utils import migrate_projects as _migrate_projects
    from mapboard.cli.migrate_utils import (
        delete_migrated_projects as _delete_migrated_projects,
        plan_projects as _plan_projects,
        promote_migrated_projects as _promote_migrated_projects,
    )

    # Foreign servers need a superuser; `mapboard schema migrate` re-owns what it builds.
    db = Database(admin_database_url())

    if dry_run:
        _plan_projects(db, only_slug=project)
    elif delete:
        _delete_migrated_projects(db, only_slug=project)
    elif promote:
        _promote_migrated_projects(db, only_slug=project)
    else:
        _migrate_projects(db, only_slug=project)


@db_app.command()
def cleanup():
    """Clean up unused database objects"""

    from .migrate_utils import (
        drop_unreferenced_topologies,
        drop_orphaned_project_schemas,
    )

    # Topologies first (proper DropTopology + catalog cleanup), then any leftover
    # migration-owned schemas no canvas/registry row references.
    drop_unreferenced_topologies(core_db)
    drop_orphaned_project_schemas(core_db)

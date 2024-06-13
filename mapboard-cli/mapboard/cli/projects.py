import asyncio
from pathlib import Path

from macrostrat.app_frame.compose import console
from macrostrat.database.transfer import pg_dump, pg_dump_to_file, pg_restore
from macrostrat.database.transfer.utils import print_stdout, print_stream_progress
from macrostrat.database.utils import create_database, database_exists
from mapboard.topology_manager.database import Database
from sqlalchemy import Engine
from typer import Typer

from .database import setup_database
from .fixtures import apply_fixtures
from .mobile_export import export_database
from .settings import POSTGRES_IMAGE, connection_string, core_db

app = Typer(name="projects", no_args_is_help=True)


@app.command(name="list")
def list_projects():
    """List Mapboard projects"""
    projects = list(core_db.run_query("SELECT slug, title, database FROM projects"))
    _databases = set(project.database for project in projects)
    all_same_database = len(_databases) == 1
    for project in projects:
        dst = f"[cyan bold]{project.slug}[/] - {project.title}"
        if not all_same_database:
            dst += f" [dim]{project.database}[/dim]"
        console.print(dst)


@app.command(name="create")
def create_project(
    project: str,
    srid: int = 4326,
    tolerance: float = 0.00001,
    database: str = "mapboard",
):
    """Create a Mapboard project database"""
    if database.startswith("mapboard") and database != "mapboard":
        raise ValueError("Project names beginning with 'mapboard' are reserved")

    DATABASE_URL = connection_string(database)
    if not database_exists(DATABASE_URL):
        create_database(DATABASE_URL)

    params = dict(
        srid=srid,
        data_schema=project,
        topo_schema=f"{project}_topology",
        tolerance=tolerance,
    )

    # Add a record to the core database
    core_db.run_sql(
        """
        INSERT INTO projects (slug, title, database, srid, data_schema, topo_schema)
        VALUES (:slug, :title, :database, :srid, :data_schema, :topo_schema)
        """,
        params=dict(slug=database, title=database, database=database, **params),
    )

    db = setup_database(database)
    apply_fixtures(db)


app.command(name="export")(export_database)


@app.command(name="copy")
def copy_database(name: str, new_database: str):
    """Copy a Mapboard project database"""
    console.print(
        f"Copying database [cyan bold]{name}[/] to [cyan bold]{new_database}[/]..."
    )
    db = Database(connection_string(name))
    new_db = Database(connection_string(new_database))
    task = move_database(db.engine, new_db.engine, postgres_container=POSTGRES_IMAGE)
    asyncio.run(task)


@app.command(name="dump")
def dump_database(name: str, dumpfile: Path):
    """Dump a Mapboard project database to a file"""
    DATABASE_URL = connection_string(name)
    db = Database(DATABASE_URL)
    task = pg_dump_to_file(dumpfile, db.engine, postgres_container=POSTGRES_IMAGE)
    asyncio.run(task)


@app.command(name="run-sql")
def _run_sql(name: str, fixtures: Path):
    """Run SQL file on a Mapboard project database"""
    DATABASE_URL = connection_string(name)
    db = setup_database(name)
    db.run_fixtures(fixtures)


query = """
"""


async def move_database(
    from_database: Engine,
    to_database: Engine,
    **kwargs,
):
    """Transfer tables from one database to another."""
    source = await pg_dump(from_database, **kwargs)
    dest = await pg_restore(to_database, create=True, **kwargs)

    await asyncio.gather(
        asyncio.create_task(print_stream_progress(source.stdout, dest.stdin)),
        asyncio.create_task(print_stdout(source.stderr)),
        asyncio.create_task(print_stdout(dest.stderr)),
    )

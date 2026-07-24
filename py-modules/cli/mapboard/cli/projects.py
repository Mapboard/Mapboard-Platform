import asyncio
from pathlib import Path

from macrostrat.database.transfer import pg_dump, pg_dump_to_file, pg_restore
from macrostrat.database.transfer.stream_utils import (
    print_stdout,
    print_stream_progress,
)
from macrostrat.database.utils import create_database, database_exists
from mapboard.topology_manager.database import Database
from sqlalchemy import Engine
from typer import Typer
from psycopg2.sql import Identifier
from .application import core_app
from mapboard.core.settings import POSTGRES_IMAGE, connection_string, core_db
from mapboard.core.database import get_topology_manager

from .database import setup_database
from .fixtures import apply_fixtures
from .mobile_export import export_database

app = Typer(name="projects", no_args_is_help=True)
console = core_app.console


@app.command(name="list")
def list_projects():
    """List Mapboard projects"""
    projects = core_db.run_query(
        """
        SELECT p.slug, p.title,
               (SELECT count(*) FROM mapboard.canvas c WHERE c.project_id = p.id) AS n_canvases
        FROM mapboard.project p
        ORDER BY p.slug
        """
    )
    for project in projects:
        console.print(
            f"[cyan bold]{project.slug}[/] - {project.title} [dim]({project.n_canvases} canvas(es))[/dim]"
        )


@app.command(name="create")
def create_project(
    project: str,
    srid: int = 4326,
    tolerance: float = 0.00001,
):
    """Create a Mapboard project in the multi-tenant model.

    Creates the project + a default 'map' canvas + main context, all in the single
    `mapboard` database, then builds the canvas's data/topology schemas via the
    topology-manager fixtures.
    """
    from mapboard.topology_manager import create_context, TopologyManager
    from mapboard.cli.migrate_utils import (
        project_schema_name,
        _register_project_schema,
    )

    if project.startswith("mapboard"):
        raise ValueError("Project slugs beginning with 'mapboard' are reserved")

    proj = core_db.run_query(
        """
        INSERT INTO mapboard.project (slug, title, srid)
        VALUES (:slug, :title, :srid)
        RETURNING id, slug, uuid
        """,
        dict(slug=project, title=project, srid=srid),
    ).one()

    canvas_slug = "map"
    data_schema = project_schema_name(proj, canvas_slug, suffix="data")
    topo_schema = project_schema_name(proj, canvas_slug, suffix="topo")

    canvas = core_db.run_query(
        """
        INSERT INTO mapboard.canvas
            (project_id, type, slug, database, data_schema, topo_schema, srid, tolerance, legacy)
        VALUES (:pid, 'map', :cslug, 'mapboard', :data_schema, :topo_schema, :srid, :tolerance, false)
        RETURNING id
        """,
        dict(
            pid=proj.id,
            cslug=canvas_slug,
            data_schema=data_schema,
            topo_schema=topo_schema,
            srid=srid,
            tolerance=tolerance,
        ),
    ).one()

    ctx_row = core_db.run_query(
        """
        INSERT INTO mapboard.context (project_id, canvas_id, name, slug)
        VALUES (:pid, :cid, :name, 'main')
        RETURNING id
        """,
        dict(pid=proj.id, cid=canvas.id, name=project),
    ).one()

    core_db.run_sql(
        "UPDATE mapboard.project SET main_context = :ctx WHERE id = :pid",
        dict(ctx=ctx_row.id, pid=proj.id),
    )

    # Build the data + topology schemas.
    ctx = create_context(
        core_db,
        data_schema=data_schema,
        topo_schema=topo_schema,
        srid=srid,
        tolerance=tolerance,
    )
    apply_fixtures(TopologyManager(ctx))

    _register_project_schema(
        core_db, proj.id, data_schema, None, "canvas_data", canvas_id=canvas.id
    )
    _register_project_schema(
        core_db, proj.id, topo_schema, None, "canvas_topo", canvas_id=canvas.id
    )
    core_db.run_sql("SELECT pg_notify('pgrst', 'reload schema')")
    core_db.session.commit()
    console.print(f"Created project [cyan bold]{project}[/] ({data_schema})")


@app.command(name="reset-topology")
def reset_topology(project: str):
    """Drop the tppology for a Mapboard project"""
    mgr = get_topology_manager(project)
    # Show what will be dropped
    db = mgr.database
    db.run_sql("SELECT topology.DropTopology(:topo_name)")

    db.run_sql("DROP SCHEMA IF EXISTS {topo_schema} CASCADE")

    linework_cols = ["topo", "topology_error", "geometry_hash"]
    for col in linework_cols:
        db.run_sql(
            "ALTER TABLE {data_schema}.linework DROP COLUMN IF EXISTS {col}",
            dict(col=Identifier(col)),
        )

    # Re-create the topology
    mgr.create_tables()


@app.command()
def drop(project: str, apply: bool = False):
    """Drop a Mapboard project — all of its schemas and metadata."""
    from mapboard.cli.migrate_utils import _drop_migration_schema

    proj = core_db.run_query(
        "SELECT id, slug, title FROM mapboard.project WHERE slug = :slug",
        dict(slug=project),
    ).one_or_none()
    if proj is None:
        console.print(f"[red]No project with slug '{project}'[/]")
        return

    schemas = core_db.run_query(
        "SELECT schema_name, kind FROM mapboard.project_schema WHERE project_id = :pid ORDER BY kind",
        dict(pid=proj.id),
    ).all()

    console.print(f"Project: [cyan bold]{proj.slug}[/] - {proj.title}")
    for s in schemas:
        console.print(f"  [dim]{s.kind}[/] {s.schema_name}")

    if not apply:
        console.print("[dim](dry run — pass --apply to drop)[/]")
        return

    # Drop topologies (via DropTopology) before their schemas, then all owned schemas,
    # then the metadata. _drop_migration_schema only drops mb_-prefixed schemas.
    for s in schemas:
        if s.kind == "canvas_topo":
            core_db.run_sql(
                "SELECT topology.DropTopology(name) FROM topology.topology WHERE name = :n",
                dict(n=s.schema_name),
            )
    for s in schemas:
        _drop_migration_schema(core_db, s.schema_name)
    core_db.run_sql("SELECT mapboard.delete_project_metadata(:pid)", dict(pid=proj.id))
    core_db.session.commit()
    console.print(f"Dropped [cyan bold]{proj.slug}[/]")


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


@app.command(name="refresh-postgrest")
def refresh_postgrest(name: str):
    """Refresh Postgrest schema for a Mapboard project database"""
    db = setup_database(name)
    db.run_sql("SELECT pg_notify('pgrst', 'reload schema')")


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

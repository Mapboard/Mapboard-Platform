from os import environ

from macrostrat.app_frame.compose import compose, console
from macrostrat.database import Database
from macrostrat.database.utils import create_database, database_exists
from typer import Typer

from .fixtures import apply_fixtures
from .mobile_export import export_database
from .settings import connection_string, core_db

app = Typer(name="projects", no_args_is_help=True)


@app.command(name="create")
def create_project(database: str, srid: int = 4326):
    """Create a Mapboard project database"""
    if database.startswith("mapboard"):
        raise ValueError("Project names beginning with 'mapboard' are reserved")

    DATABASE_URL = connection_string(database)
    if not database_exists(DATABASE_URL):
        create_database(DATABASE_URL)

    # Add a record to the core database
    core_db.run_sql(
        "INSERT INTO projects (slug, title, database, srid) VALUES (:slug, :title, :database, :srid)",
        params=dict(slug=database, title=database, database=database, srid=srid),
    )

    db = Database(DATABASE_URL)
    apply_fixtures(db, srid=srid)


app.command(name="export")(export_database)


@app.command(name="copy")
def copy_database(database: str, new_database: str):
    """Copy a Mapboard project database"""
    console.print(
        f"Copying database [cyan bold]{database}[/] to [cyan bold]{new_database}[/]..."
    )

    env = dict(
        PGUSER=environ.get("POSTGRES_USER") or "postgres",
        PGPASSWORD=environ.get("POSTGRES_PASSWORD") or "postgres",
        PGHOST="localhost",
        PGPORT="5432",
    )

    envargs = []
    for k, v in env.items():
        envargs.extend(["-e", f"{k}={v}"])

    compose("exec", *envargs, "database", "createdb", new_database)
    compose(
        "exec",
        *envargs,
        "database",
        "bash",
        "-c",
        f'"pg_dump {database} | psql {new_database}"',
        shell=True,
    )

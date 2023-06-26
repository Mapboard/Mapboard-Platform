from pathlib import Path
from ..config import connection_string
from macrostrat.database import Database, run_sql
from rich import print

from sqlalchemy import create_engine
from sqlalchemy.event import listen
from sqlalchemy.orm import sessionmaker, scoped_session, Session
from rich.traceback import install

install(show_locals=True)

# Must use Python built with sqlite3 extension support
# https://github.com/pyenv/pyenv/issues/1702


def export_database(project: str, output: Path, overwrite: bool = False):
    """Export a Mapboard project database to a Spatialite file"""
    if not output.parent.exists():
        raise ValueError(f"No such directory: {output.parent}")

    if not output.suffix == ".mapboard-project":
        raise ValueError(f"Output file must have .mapboard-project extension")

    # Check if project exists
    conn_string = connection_string(project)
    db = Database(conn_string)
    db.session.execute("SELECT 1")
    db.session.close()
    print(f"Database [bold]{project}[/bold] exists!")

    # Create spatialite file
    print(f"Creating Mapboard project package at [bold]{output}[/bold]...")

    output.mkdir(exist_ok=overwrite)
    db_path = output / "mapboard-project.db"
    if db_path.exists() and overwrite:
        db_path.unlink()

    engine = setup_spatialite(db_path)
    session_factory = sessionmaker(bind=engine)
    session = scoped_session(session_factory)

    fixtures = Path(__file__).parent / "fixtures" / "create-tables.sql"

    run_sql(session, fixtures, params=dict(SRID=32711))


def setup_spatialite(db_path: Path):
    engine = create_engine(f"sqlite:///{db_path}")
    listen(engine, "connect", load_spatialite)
    return engine


def load_spatialite(dbapi_conn, _):
    dbapi_conn.enable_load_extension(True)
    dbapi_conn.load_extension("/usr/local/lib/mod_spatialite.dylib")

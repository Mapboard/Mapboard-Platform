from pathlib import Path
from ..config import connection_string
from macrostrat.database import Database, run_sql
from macrostrat.database.utils import connection_args
from rich import print
from rich.progress import Progress

from geoalchemy2 import Geometry, Geography
from sqlalchemy import create_engine
from sqlalchemy.event import listen
from sqlalchemy.orm import sessionmaker, scoped_session, Session
from rich.traceback import install
from sqlalchemy import Table, MetaData, func
from sqlalchemy.sql import insert, select
from sqlalchemy.exc import IntegrityError
from json import dumps

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
    db_path = output / "mapboard.db"
    if db_path.exists() and overwrite:
        db_path.unlink()

    SRID: int = db.session.execute(
        "SELECT srid FROM geometry_columns WHERE f_table_schema = :schema AND f_table_name = :table",
        params=dict(schema="mapboard", table="polygon"),
    ).scalar()

    # Basically the same as macrostrat.database but Spatialite
    engine = setup_spatialite(db_path)
    session_factory = sessionmaker(bind=engine)
    session = scoped_session(session_factory)

    # Get table

    fixtures = Path(__file__).parent / "fixtures" / "create-tables.sql"

    run_sql(session, fixtures, params=dict(SRID=SRID))

    meta = MetaData()

    meta.reflect(bind=engine)

    # Set up geometry columns
    meta.tables["polygon"].c.geometry.type = Geometry("MULTIPOLYGON", srid=SRID)
    meta.tables["linework"].c.geometry.type = Geometry("MULTILINESTRING", srid=SRID)

    cfg = meta.tables["mapboard_config"]

    # Ideally this would be synthesized automatically by the app, but it isn't yet
    bkend_config = {"type": "Spatialite", "address": "file:///unknown", "srid": SRID}
    name = output.stem
    location = "Unknown"

    stmt = insert(cfg)
    session.execute(stmt.values(key="backend", value=dumps(bkend_config)))
    session.execute(stmt.values(key="name", value=name))
    session.execute(stmt.values(key="location", value=location))
    session.commit()

    migrations = ["v1", "v2.0", "v2.3", "layers.0", "layers.1"]

    mgr = meta.tables["grdb_migrations"]
    stmt = insert(mgr)

    for migration in migrations:
        session.execute(stmt.values(identifier=migration))
    session.commit()

    table_queries = Path(__file__).parent / "table_queries"
    with Progress() as progress:
        for f in table_queries.glob("*.sql"):
            sql = f.read_text()
            query = db.session.execute(sql)
            table_name = f.stem.replace("-", "_")
            tbl = meta.tables[table_name]
            insert_stmt = insert(tbl)
            nrows = db.session.execute(
                "SELECT count(*) FROM mapboard." + table_name
            ).scalar_one()

            # rich progress bar
            task = progress.add_task(f"Table [bold]{table_name}[/bold]", total=nrows)

            for row in query:
                try:
                    session.execute(insert_stmt, row._mapping)
                except IntegrityError as e:
                    print(e)
                progress.update(task, advance=1)
            session.commit()

    # Insert data

    # fake_conn = db.engine.raw_connection()
    # fake_cur = fake_conn.cursor()
    # fake_cur.copy_expert(copy_stmt, sys.stdout)


def setup_spatialite(db_path: Path):
    engine = create_engine(f"sqlite:///{db_path}")
    listen(engine, "connect", load_spatialite)
    return engine


def load_spatialite(dbapi_conn, _):
    dbapi_conn.enable_load_extension(True)
    dbapi_conn.load_extension("/usr/local/lib/mod_spatialite.dylib")


def chunked_iterator(iterable, chunksize):
    """Yield successive n-sized chunks from l."""
    for i in range(0, len(iterable), chunksize):
        yield iterable[i : i + chunksize]

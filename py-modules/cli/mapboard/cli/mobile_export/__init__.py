from json import dumps
from pathlib import Path

from geoalchemy2 import Geometry
from macrostrat.database import Database, run_sql
from rich import print
from rich.progress import Progress
from rich.traceback import install
from sqlalchemy import MetaData, create_engine
from sqlalchemy.event import listen
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import scoped_session, sessionmaker
from sqlalchemy.sql import insert

from mapboard.core.settings import connection_string

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
    db.run_query("SELECT 1")
    db.session.close()
    print(f"Database [bold]{project}[/bold] exists!")

    # Create spatialite file
    print(f"Creating Mapboard project package at [bold]{output}[/bold]...")

    output.mkdir(exist_ok=overwrite)
    db_path = output / "mapboard.db"
    if db_path.exists() and overwrite:
        db_path.unlink()

    SRID: int = db.run_query(
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
    backend_config = {"type": "Spatialite", "address": "file:///unknown", "srid": SRID}
    config = {
        "backend": dumps(backend_config),
        "name": output.stem,
        "location": "Unknown",
    }

    stmt = insert(cfg)
    for key, value in config.items():
        session.execute(stmt.values(key=key, value=value))
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
            query = db.run_query(sql)
            table_name = f.stem.replace("-", "_")
            tbl = meta.tables[table_name]
            insert_stmt = insert(tbl)
            nrows = db.run_query(
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


def setup_spatialite(db_path: Path):
    engine = create_engine(f"sqlite:///{db_path}")
    listen(engine, "connect", load_spatialite)
    return engine


def load_spatialite(dbapi_conn, _):
    dbapi_conn.enable_load_extension(True)
    dbapi_conn.load_extension("/opt/homebrew/lib/mod_spatialite.dylib")


def chunked_iterator(iterable, chunksize):
    """Yield successive n-sized chunks from l."""
    for i in range(0, len(iterable), chunksize):
        yield iterable[i : i + chunksize]

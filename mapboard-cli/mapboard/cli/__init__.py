import json
import logging
import sys
from os import environ
from pathlib import Path
from subprocess import run
from subprocess import run as _run
from typing import Optional

import click
import pytest
import typer
from dotenv import load_dotenv
from macrostrat.app_frame import Application
from macrostrat.app_frame.compose import compose, console
from macrostrat.database import Database, run_sql
from macrostrat.dinosaur import create_migration, temp_database
from macrostrat.utils import setup_stderr_logs
from psycopg2.sql import SQL, Identifier, Literal
from sqlalchemy import text

from .config import connection_string
from .definitions import MAPBOARD_ROOT
from .mobile_export import export_database

# For some reason, environment variables aren't loading correctly
# using the app_frame module. Or maybe, env vars set there
# aren't available outside of module code.
load_dotenv(MAPBOARD_ROOT / ".env")


# Could probably manage this within the application config.


app_ = Application(
    "Mapboard",
    restart_commands={"gateway": "caddy reload --config /etc/caddy/Caddyfile"},
    app_module="mapboard.server",
    compose_files=[MAPBOARD_ROOT / "system" / "docker-compose.yaml"],
)
app_.setup_logs(verbose=True)
setup_stderr_logs("macrostrat.utils", level=logging.DEBUG)
app = app_.control_command()


@app.command()
def create_fixtures(database: str):
    """Create fixtures in a given database"""
    console.print(f"Creating fixtures in database [cyan bold]{database}[/]...")
    DATABASE_URL = connection_string(database)
    db = Database(DATABASE_URL)
    srid = environ.get("MAPBOARD_SRID")
    if srid is not None:
        srid = int(srid)
    apply_fixtures(db, srid=srid)


def apply_fixtures(database: Database, srid: Optional[int] = 4326):
    fixtures = Path(__file__).parent / "fixtures" / "server"
    files = list(fixtures.rglob("*.sql"))
    files.sort()
    for fixture in files:
        database.run_sql(
            fixture,
            params=dict(
                data_schema=Identifier("mapboard"),
                topo_schema=Identifier("map_topology"),
                cache_schema=Identifier("mapboard_cache"),
                index_prefix=SQL("mapboard"),
                srid=Literal(srid),
                tms_srid=Literal(3857),
            ),
        )


@app.command(name="create")
def create_project(database: str, srid: int = 4326):
    """Create a Mapboard project database"""
    if database.startswith("mapboard"):
        raise ValueError("Project names beginning with 'mapboard' are reserved")

    compose("exec database", "createdb", "-U", "mapboard_admin", database)
    DATABASE_URL = connection_string(database)
    db = Database(DATABASE_URL)
    apply_fixtures(db, srid=srid)


app.command(name="export")(export_database)


def get_srid(db: Database) -> int:
    return db.session.execute(
        text("SELECT Find_SRID('mapboard', 'linework', 'geometry')")
    ).scalar()


@app.command()
def migrate(database: str, apply: bool = False, allow_unsafe: bool = False):
    """Migrate a Mapboard project database to the latest version"""
    console.print(f"Migrating database [cyan bold]{database}[/]...")
    DATABASE_URL = connection_string(database)
    db = Database(DATABASE_URL)

    srid = get_srid(db)

    _apply_fixtures = lambda _db: apply_fixtures(_db, srid=srid)

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


@app.command()
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


# Allow extra args to be passed to yarn
@app.command(
    name="topology",
    short_help="Watch topology for changes",
    context_settings={"allow_extra_args": True, "ignore_unknown_options": True},
)
def watch_topology(ctx: typer.Context, project: str):
    """Watch a project's topology for changes"""
    cfg_dir = MAPBOARD_ROOT / "cfg"
    cfg_dir.mkdir(exist_ok=True)
    cfg_file = cfg_dir / f"{project}.json"
    db_url = connection_string(project)

    db = Database(db_url)
    console.log(db_url)

    srid = get_srid(db)

    cfg = {
        "connection": db_url.replace("localhost", "0.0.0.0"),
        "topo_schema": "map_topology",
        "data_schema": "mapboard",
        "srid": srid,
        "tolerance": 0.1,
    }
    cfg_file.write_text(json.dumps(cfg, indent=2))
    workdir = MAPBOARD_ROOT / "postgis-geologic-map"

    run(
        ["yarn", "run", "ts-node", "--transpile-only", "src/geologic-map", *ctx.args],
        cwd=workdir,
        env={**environ, "GEOLOGIC_MAP_CONFIG": str(cfg_file.absolute())},
    )


@click.command(
    "test",
    context_settings=dict(
        ignore_unknown_options=True,
        help_option_names=[],
        max_content_width=160,
        # Doesn't appear to have landed in Click 7? Or some other reason we can't access...
        # short_help_width=160,
    ),
)
@click.argument("args", nargs=-1, type=click.UNPROCESSED)
def test(args=[]):
    """Run mapboard-server tests"""
    testdir = MAPBOARD_ROOT / "mapboard-server"
    POSTGRES_USER = environ.get("POSTGRES_USER") or "postgres"
    POSTGRES_PASSWORD = environ.get("POSTGRES_PASSWORD") or "postgres"
    MAPBOARD_DB_PORT = environ.get("MAPBOARD_DB_PORT") or 54398

    test_database = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@localhost:{MAPBOARD_DB_PORT}/mapboard_test_database"
    environ.update({"TESTING_DATABASE": test_database})

    with temp_database(test_database) as engine:
        db = Database(engine.url)
        apply_fixtures(db, srid=32612)
        pytest.main([str(testdir), *args])


app.add_click_command(test, "test")

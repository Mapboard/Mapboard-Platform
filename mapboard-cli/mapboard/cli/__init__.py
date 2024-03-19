import json
import logging
from base64 import b64encode
from binascii import hexlify
from os import environ
from subprocess import run

import click
import pytest
import typer
from macrostrat.app_frame import Application
from macrostrat.app_frame.compose import compose, console
from macrostrat.database import Database
from macrostrat.dinosaur import temp_database
from macrostrat.utils import setup_stderr_logs

from .database import db_app, get_srid
from .fixtures import apply_fixtures
from .projects import app as projects_app
from .settings import MAPBOARD_ROOT, connection_string

app_ = Application(
    "Mapboard",
    restart_commands={
        "gateway": "caddy reload --config /etc/caddy/Caddyfile",
    },
    log_modules=["mapboard.server"],
    compose_files=[MAPBOARD_ROOT / "system" / "docker-compose.yaml"],
)
app_.setup_logs(verbose=True)
setup_stderr_logs("macrostrat.utils", level=logging.DEBUG)
app = app_.control_command()

app.add_typer(projects_app, help="Manage Mapboard projects")
app.add_typer(db_app, help="Database management")


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
    db_url = connection_string(project, container_internal=True)

    db_url_external = connection_string(project).replace("localhost", "0.0.0.0")
    db = Database(db_url_external)
    srid = get_srid(db)

    cfg = {
        "connection": db_url,
        "topo_schema": "map_topology",
        "data_schema": "mapboard",
        "srid": srid,
        "tolerance": 0.1,
    }
    cfg_str = json.dumps(cfg)
    # Encode to hex
    cfg_str = hexlify(cfg_str.encode("utf-8")).decode("utf-8")

    # escape the JSON string

    compose(
        "run",
        "--rm",
        "--env",
        f"GEOLOGIC_MAP_CONFIG_JSON={cfg_str}",
        "topology_manager",
        *ctx.args,
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

import json
import logging
import sys
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

from .database import db_app, get_srid, project_params
from .fixtures import apply_fixtures
from .projects import app as projects_app
from .settings import MAPBOARD_ROOT, connection_string
from .units import move_unit
from .watch import watch


def prepare_compose_env(app) -> dict[str, str]:
    """Prepare the environment for docker-compose"""
    if environ.get("COMPOSE_PROFILES") != None:
        # We're using a user-set custom profile; don't override it
        return {}

    compose_profiles = []

    if environ.get("MAPBOARD_API_ADDRESS") == None:
        compose_profiles.append("production")

    return {"COMPOSE_PROFILES": " ".join(compose_profiles)}


app_ = Application(
    "Mapboard",
    restart_commands={
        "gateway": "caddy reload --config /etc/caddy/Caddyfile",
    },
    log_modules=["mapboard.server"],
    compose_files=[MAPBOARD_ROOT / "system" / "docker-compose.yaml"],
    env=prepare_compose_env,
)
app_.setup_logs(verbose=True)
setup_stderr_logs("macrostrat.utils", level=logging.DEBUG)
app = app_.control_command()

app.add_typer(projects_app, help="Manage Mapboard projects")
app.add_typer(db_app, help="Database management")

app.command(name="watch")(watch)


# Allow extra args to be passed to yarn
@app.command(
    name="topo",
    short_help="Topology management",
    context_settings={"allow_extra_args": True, "ignore_unknown_options": True},
)
def _topology(ctx: typer.Context, project: str):
    """Watch a project's topology for changes"""
    params = project_params(project)
    database = params.pop("database")

    db_url = connection_string(database, container_internal=False)

    environ.update(
        {
            "MAPBOARD_DATABASE_URL": db_url,
            "MAPBOARD_DATA_SCHEMA": params["data_schema"],
            "MAPBOARD_TOPO_SCHEMA": params["topo_schema"],
            "MAPBOARD_SRID": str(params["srid"]),
            "MAPBOARD_TOPO_TOLERANCE": str(params["tolerance"]),
        }
    )

    from mapboard.topology_manager.cli import app

    sys.argv = [f"mapboard topo {project}", *ctx.args]

    app()


app.command(name="move-unit")(move_unit)


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

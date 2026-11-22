import logging
import sys
from os import environ
import click
import pytest
import typer
import logging

from macrostrat.app_frame import Application
from macrostrat.app_frame.secrets import Secret
from macrostrat.schema_management.cli import create_schema_cli
from sqlalchemy.engine import make_url
from macrostrat.database import Database
from macrostrat.dinosaur import temp_database
from macrostrat.utils import setup_stderr_logs
from mapboard.core.settings import MAPBOARD_ROOT, database_url
from mapboard.core.workers import watch_topology, send_event
from mapboard.topology_manager import TopologyManager, TopologyContext

from .config import environments
from .application import MapboardApplication, console
from .schema import schema_app
from .database import db_app, get_srid, project_params
from .fixtures import apply_fixtures
from .projects import app as projects_app
from .units import move_unit
from mapboard.core.database import get_topology_manager
from mapboard.topology_manager.config import _side_effects

# setup_stderr_logs("macrostrat.utils", level=logging.DEBUG)
core_app = MapboardApplication()
app = core_app.control_command()

app.add_typer(environments.cli(), name="env", help="Choose the environment")
app.add_typer(create_schema_cli(schema_app), name="schema", help="Core database schema")
app.add_typer(projects_app, help="Manage Mapboard projects")
app.add_typer(db_app, help="Database management")


@app.command()
def config():
    """Show the settings the tools are using"""
    settings = environments.settings
    database = settings.get("database")
    if database is None:
        shown = f"[dim]not set; from .env:[/] {_hide_password(database_url())}"
    elif isinstance(database, Secret):
        # A reference names the credential without being one.
        shown = f"{database.ref} [dim](not fetched)[/]"
    else:
        shown = _hide_password(database)
    env_class = environments.env_class.value
    console.print(f"config file:    {environments.config_file or '[dim]none[/]'}")
    console.print(f"environment:    {environments.env or '[dim]none[/]'} ({env_class})")
    console.print(f"database:       {shown}")
    console.print(f"planning image: {settings.get('planning_image')}")


def _hide_password(url: str) -> str:
    return make_url(url).render_as_string(hide_password=True)


from .access import app as access_app
from .tasks import app as tasks_app

app.add_typer(access_app, help="Manage who may read and edit projects")
app.add_typer(tasks_app, help="Background topology rebuilds")

app.command(name="watch")(watch_topology)
app.command(name="send-event")(send_event)

from .ingest import ingest_map

app.command(name="ingest")(ingest_map)

from .ops import app as ops_app

app.add_typer(ops_app, name="ops", help="Misc. operations")

from mapboard.cross_sections import app as xs_app

app.add_typer(xs_app, help="Cross sections (Naukluft)", rich_help_panel="Subsystems")

from .criticalmaas import app as cdr_app

app.add_typer(cdr_app, help="CriticalMAAS CDR commands", rich_help_panel="Subsystems")


from mapboard.topology_manager.cli import app as topo_app


@topo_app.callback()
def topo_callback(project: str = typer.Argument(None, help="Project slug")):
    # Set up the environment for the topology manager
    mgr = get_topology_manager(project)
    # set up the topology manager context to be used by subcommands
    _side_effects(mgr.ctx)


app.add_typer(topo_app, name="topo", help="Topology management")


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
        db = Database(engine)
        ctx = TopologyContext(db, srid=32612)
        mgr = TopologyManager(ctx)
        apply_fixtures(mgr)
        pytest.main([str(testdir), *args])


app.add_click_command(test, "test")

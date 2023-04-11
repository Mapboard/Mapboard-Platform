# Typer command-line application

import typer
import click
import subprocess
import rich
from os import environ
from macrostrat.utils import cmd
from .definitions import MAPBOARD_ROOT

app = typer.Typer(no_args_is_help=True, add_completion=False)

console = rich.console.Console()


@app.callback()
def callback():
    """
    Mapboard command-line interface
    """


@app.command()
def up():
    """Start the Mapboard server and follow logs."""
    compose("up", "-d")
    console.print("Starting Mapboard server...")
    compose("logs", "-f", "--since=1s")


def compose(*args):
    """Run docker compose commands in the appropriate context"""
    env = environ.copy()
    env["COMPOSE_PROJECT_NAME"] = "mapboard"
    env["COMPOSE_FILE"] = str(MAPBOARD_ROOT / "system" / "docker-compose.yaml")
    cmd("docker", "compose", *args, env=env)


@click.command(
    "compose",
    context_settings=dict(
        ignore_unknown_options=True,
        help_option_names=[],
        max_content_width=160,
        # Doesn't appear to have landed in Click 7? Or some other reason we can't access...
        # short_help_width=160,
    ),
)
@click.argument("args", nargs=-1, type=click.UNPROCESSED)
def _compose(args):
    """Run docker compose commands in the appropriate context"""
    compose(args)


cli = typer.main.get_command(app)
cli.add_command(_compose, "compose")

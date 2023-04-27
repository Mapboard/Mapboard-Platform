# Typer command-line application

import typer
import click
import rich
import sys
from os import environ
from .compose import compose, check_status, follow_logs
from typer.core import TyperGroup
from typer.models import TyperInfo
from typer import Context
from typer import Typer
from dotenv import load_dotenv
from time import sleep
from .definitions import MAPBOARD_ROOT
from macrostrat.utils import get_logger, setup_stderr_logs
import threading

load_dotenv(MAPBOARD_ROOT / ".env")

environ["DOCKER_SCAN_SUGGEST"] = "false"
environ["DOCKER_BUILDKIT"] = "1"

log = get_logger(__name__)


class OrderCommands(TyperGroup):
    def list_commands(self, ctx: Context):
        """Return list of commands in the order of appearance."""
        return list(self.commands)  # get commands using self.commands


class ControlCommand(Typer):
    name: str

    def __init__(self, name, *args, **kwargs):
        kwargs.setdefault("add_completion", False)
        kwargs.setdefault("no_args_is_help", True)
        kwargs.setdefault("cls", OrderCommands)
        kwargs.setdefault("name", name)
        super().__init__(*args, **kwargs)
        self.name = name

        def callback(ctx: Context, verbose: bool = False):
            ctx.obj = ApplicationConfig(self.name)

            if verbose:
                setup_stderr_logs("mapboard")

        callback.__doc__ = f"""{self.name} command-line interface"""

        self.registered_callback = TyperInfo(callback=callback)


console = rich.console.Console()


class ApplicationConfig:
    name: str

    def __init__(self, name: str):
        self.name = name

    def print(self, text, style=None):
        text = text.replace(":app_name:", self.name)
        text = text.replace(":command_name:", self.name.lower())
        console.print(text, style=style)


app = ControlCommand(name="Mapboard")


@app.command()
def up(
    ctx: Context, container: str = typer.Argument(None), force_recreate: bool = False
):
    """Start the Mapboard server and follow logs."""
    cfg = ctx.find_object(ApplicationConfig)
    if container is None:
        container = ""

    compose("build", container)

    sleep(0.1)

    res = compose(
        "up",
        "--no-start",
        "--remove-orphans",
        "--force-recreate" if force_recreate else "",
        container,
    )
    if res.returncode != 0:
        cfg.print(
            "One or more containers did not build successfully, aborting.",
            style="red bold",
        )
        sys.exit(res.returncode)
    else:
        cfg.print("All containers built successfully.", style="green bold")

    running_containers = check_status(cfg.name, cfg.name.lower())
    cfg.print("Starting :app_name: server...", style="bold")
    compose("start")

    if "gateway" in running_containers:
        cfg.print("Reloading gateway server...", style="bold")
        compose("exec -w /etc/caddy gateway caddy reload")

    thread = threading.Thread(
        target=follow_logs, args=(cfg.name, cfg.name.lower(), container)
    )
    thread.start()

    # Wait for input
    restart = False
    # Can't figure out how to get restarting to work properly
    try:
        thread.wait()
    finally:
        # Stop the thread
        thread.join()

    if restart:
        ctx.invoke(up, ctx, container, force_recreate=True)


@app.command()
def down(ctx: Context):
    """Stop the server."""
    cfg = ctx.find_object(ApplicationConfig)
    cfg.print("Stopping :app_name: server...", style="bold")
    compose("down", "--remove-orphans")


@app.command()
def restart(ctx: Context, container: str = typer.Argument(None)):
    """Restart the server and follow logs."""
    ctx.invoke(up, ctx, container, force_recreate=True)


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
    compose(*args)


cli = typer.main.get_command(app)
cli.add_command(_compose, "compose")

# Typer command-line application

import typer
import click
import rich
import sys
from .compose import compose, check_status, follow_logs
from typer.core import TyperGroup
from typer.models import TyperInfo
from typer import Context
from typer import Typer
from dotenv import load_dotenv
from .definitions import MAPBOARD_ROOT

load_dotenv(MAPBOARD_ROOT / ".env")


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

        def callback(ctx: Context):
            ctx.obj = ApplicationConfig(self.name)

        callback.__doc__ = f"""{self.name} command-line interface"""

        self.registered_callback = TyperInfo(callback=callback)


console = rich.console.Console()


class ApplicationConfig:
    name: str

    def __init__(self, name: str):
        self.name = name

    def print(self, text, style=None):
        text = text.replace(":app_name:", self.name)
        console.print(text, style=style)


app = ControlCommand(name="Mapboard")


@app.command()
def up(ctx: Context, container: str = "", force_recreate: bool = False):
    """Start the Mapboard server and follow logs."""
    cfg = ctx.find_object(ApplicationConfig)

    res = compose(
        "up",
        "-d",
        "--build",
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

    cfg.print("Starting :app_name: server...", style="bold")
    check_status(cfg.name, cfg.name.lower())
    follow_logs(cfg.name, cfg.name.lower())


@app.command()
def down(ctx: Context):
    """Stop the server."""
    cfg = ctx.find_object(ApplicationConfig)
    cfg.print("Stopping :app_name: server...", style="bold")
    compose("down", "--remove-orphans")


@app.command()
def restart(ctx: Context):
    """Restart the server and follow logs."""
    ctx.invoke(up, ctx, force_recreate=True)


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

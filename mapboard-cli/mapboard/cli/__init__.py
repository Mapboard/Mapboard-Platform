# Typer command-line application

import typer
import click
import rich
import sys
from .compose import compose, check_status, follow_logs
from typer.core import TyperGroup
from typer import Context


class OrderCommands(TyperGroup):
    def list_commands(self, ctx: Context):
        """Return list of commands in the order appear."""
        return list(self.commands)  # get commands using self.commands


app = typer.Typer(no_args_is_help=True, add_completion=False, cls=OrderCommands)

console = rich.console.Console()


@app.callback()
def callback():
    """
    Mapboard command-line interface
    """


@app.command()
def up(container: str = "", force_recreate: bool = False):
    """Start the Mapboard server and follow logs."""
    res = compose(
        "up",
        "-d",
        "--build",
        "--remove-orphans",
        "--force-recreate" if force_recreate else "",
        container,
    )
    if res.returncode != 0:
        console.print(
            "[red bold]One or more containers did not build successfully, aborting."
        )
        sys.exit(res.returncode)
    else:
        console.print("[green bold]All containers built successfully.")

    console.print("[bold]Starting Mapboard server...")
    check_status("Mapboard", "mapboard")
    follow_logs("Mapboard", "mapboard")


@app.command()
def down():
    """Stop the Mapboard server."""
    console.print("[bold]Stopping Mapboard server...")
    compose("down", "--remove-orphans")


@app.command()
def restart(ctx: Context):
    """Restart the Mapboard server and follow logs."""
    ctx.invoke(up, force_recreate=True)


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

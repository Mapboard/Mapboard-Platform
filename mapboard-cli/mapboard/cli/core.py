# Typer command-line application

import typer
import click
import rich
import sys
from os import environ
from .compose import compose, check_status
from typer.core import TyperGroup
from typer.models import TyperInfo
from typer import Context
from typer import Typer
from dotenv import load_dotenv
from time import sleep
from .definitions import MAPBOARD_ROOT
from .system import AppConfig
from macrostrat.utils import get_logger, setup_stderr_logs
from contextlib import contextmanager
from click import Group
import logging

from .follow_logs import follow_logs_with_reloader, Result

from .compose import console

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

    app: AppConfig
    _click: Group

    def __init__(self, name, *args, **kwargs):
        kwargs.setdefault("add_completion", False)
        kwargs.setdefault("no_args_is_help", True)
        kwargs.setdefault("cls", OrderCommands)
        kwargs.setdefault("name", name)
        super().__init__(*args, **kwargs)
        self.app = AppConfig(name, command_name=kwargs.pop("command_name", None))
        self.name = name

        app_module = kwargs.pop("app_module", name)

        def callback(ctx: Context, verbose: bool = False):
            ctx.obj = AppConfig(self.name)

            if verbose:
                setup_stderr_logs(app_module)
            else:
                # Disable all logging
                # TODO: This is a hack, we shouldn't have to explicitly disable
                # logging in the CLI. Perhaps there's somewhere that it's being
                # enabled that we haven't chased down?
                setup_stderr_logs("", level=logging.CRITICAL)

        callback.__doc__ = f"""{self.app.name} command-line interface"""

        self.registered_callback = TyperInfo(callback=callback)

        # Click commands must be added after Typer commands in the current design.
        self._click_commands = []

        self.build_commands()

    def build_commands(self):
        for cmd in [up, down, restart]:
            if cmd.__doc__ is not None:
                cmd.__doc__ = self.app.replace_names(cmd.__doc__)
            self.command(rich_help_panel="System")(cmd)
        self.add_click_command(_compose, "compose", rich_help_panel="System")

    def add_click_command(self, cmd, *args, **kwargs):
        """Add a click command for lazy initialization
        params:
            cmd: click command
            args: args to pass to click.add_command
            kwargs: kwargs to pass to click.add_command
            rich_help_panel: name of rich help panel to add to
        """
        rich_help_panel = kwargs.pop("rich_help_panel", None)
        if rich_help_panel is not None:
            setattr(cmd, "rich_help_panel", rich_help_panel)
        cfunc = lambda _click: _click.add_command(cmd, *args, **kwargs)
        self._click_commands.append(cfunc)

    def __call__(self):
        """Run this command using its underlying click object."""
        cmd = typer.main.get_command(self)
        assert isinstance(cmd, click.Group)
        self._click = cmd
        for cfunc in self._click_commands:
            cfunc(self._click)
        return self._click()


def up(
    ctx: Context, container: str = typer.Argument(None), force_recreate: bool = False
):
    """Start the :app_name: server and follow logs."""
    app = ctx.find_object(AppConfig)
    if app is None:
        raise ValueError("Could not find application config")
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
        app.info(
            "One or more containers did not build successfully, aborting.",
            style="red bold",
        )
        sys.exit(res.returncode)
    else:
        app.info("All containers built successfully.", style="green bold")

    running_containers = check_status(app.name, app.name.lower())

    app.info("Starting :app_name: server...", style="bold")
    compose("start")

    if "gateway" in running_containers:
        app.info("Reloading gateway server...", style="bold")
        compose("exec -w /etc/caddy gateway caddy reload")

    res = follow_logs_with_reloader(app, container)
    if res == Result.RESTART:
        app.info("Restarting :app_name: server...", style="bold")
        ctx.invoke(up, ctx, container)
    elif res == Result.EXIT:
        app.info("Stopping :app_name: server...", style="bold")
        ctx.invoke(down, ctx)
    elif res == Result.CONTINUE:
        app.info(
            "[bold]Detaching from logs[/bold] [dim](:app_name: will continue to run)[/dim]",
            style="bold",
        )
        return


def down(ctx: Context):
    """Stop all :app_name: services."""
    app = ctx.find_object(AppConfig)
    if app is None:
        raise ValueError("Could not find application config")
    app.info("Stopping :app_name: server...", style="bold")
    compose("down", "--remove-orphans")


def restart(ctx: Context, container: str = typer.Argument(None)):
    """Restart the :app_name: server and follow logs."""
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

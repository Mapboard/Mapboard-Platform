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
from contextlib import contextmanager
import logging
import io
from subprocess import Popen, PIPE, STDOUT, TimeoutExpired
import threading
import tempfile

from .compose import console

load_dotenv(MAPBOARD_ROOT / ".env")

environ["DOCKER_SCAN_SUGGEST"] = "false"
environ["DOCKER_BUILDKIT"] = "1"

log = get_logger(__name__)

import termios, fcntl, sys, os


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

        app_module = kwargs.pop("app_module", name)

        def callback(ctx: Context, verbose: bool = False):
            ctx.obj = ApplicationConfig(self.name)

            if verbose:
                setup_stderr_logs(app_module)
            else:
                # Disable all logging
                # TODO: This is a hack, we shouldn't have to explicitly disable
                # logging in the CLI. Perhaps there's somewhere that it's being
                # enabled that we haven't chased down?
                setup_stderr_logs("", level=logging.CRITICAL)

        callback.__doc__ = f"""{self.name} command-line interface"""

        self.registered_callback = TyperInfo(callback=callback)


class ApplicationConfig:
    name: str

    def __init__(self, name: str):
        self.name = name

    def print(self, text, style=None):
        text = text.replace(":app_name:", self.name)
        text = text.replace(":command_name:", self.name.lower())
        console.print(text, style=style)


app = ControlCommand(name="Mapboard")


@contextmanager
def wait_for_keys():
    fd = sys.stdin.fileno()

    oldterm = termios.tcgetattr(fd)
    newattr = termios.tcgetattr(fd)
    newattr[3] = newattr[3] & ~termios.ICANON & ~termios.ECHO
    termios.tcsetattr(fd, termios.TCSANOW, newattr)

    oldflags = fcntl.fcntl(fd, fcntl.F_GETFL)
    fcntl.fcntl(fd, fcntl.F_SETFL, oldflags | os.O_NONBLOCK)

    try:
        yield
    finally:
        termios.tcsetattr(fd, termios.TCSAFLUSH, oldterm)
        fcntl.fcntl(fd, fcntl.F_SETFL, oldflags)


@app.command()
def up(
    ctx: Context, container: str = typer.Argument(None), force_recreate: bool = False
):
    """Start the :app_name: server and follow logs."""
    cfg = ctx.find_object(ApplicationConfig)
    if cfg is None:
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

    print("Test")

    with tempfifo(mode="wb") as buffer, open(buffer.name, "rb") as reader:
        print("buffer", buffer.name)
        log_cmd = follow_logs(
            cfg.name,
            cfg.name.lower(),
            container,
            wait_for_completion=False,
            stdout=buffer,
        )
        # wait for logging subprocess
        assert isinstance(log_cmd, Popen)
        # detach from parent process
        while log_cmd.poll() is None:
            console.print("polling")
            console.print(reader.read().decode("utf-8"))
            sleep(0.5)
            key = sys.stdin.read()
            if key == "\x03":
                break
            console.print("key", key)
        # Read the remaining
        sys.stdout.write(reader.read().decode("utf-8"))

        # stdout = log_cmd.stdout.readlines()
        # for line in stdout:
        #     console.print(line.decode("utf-8"), end="")

        try:
            with wait_for_keys():
                while True:
                    try:
                        key = sys.stdin.read(1)
                        if key == "\x03":
                            break
                    except IOError:
                        pass
        finally:
            log_cmd.terminate()
            log_cmd.wait()


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


@contextmanager
def tempfifo(mode="wb"):
    tmpdir = tempfile.mkdtemp()
    filename = os.path.join(tmpdir, "myfifo")
    try:
        # os.mkfifo(filename)
        fifo = open(filename, mode)
        yield fifo
        fifo.close()

        # write stuff to fifo
    finally:
        os.remove(filename)
        os.rmdir(tmpdir)

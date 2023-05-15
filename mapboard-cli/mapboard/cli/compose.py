from os import environ
from macrostrat.utils import cmd
from rich.console import Console
from subprocess import Popen

from .definitions import MAPBOARD_ROOT


console = Console()


def _build_compose_env():
    env = environ.copy()
    env["COMPOSE_PROJECT_NAME"] = "mapboard"
    env["COMPOSE_FILE"] = str(MAPBOARD_ROOT / "system" / "docker-compose.yaml")
    return env


def compose(*args, **kwargs):
    """Run docker compose commands in the appropriate context"""
    env = kwargs.pop("env", _build_compose_env())
    return cmd("docker", "compose", *args, env=env, **kwargs)


def check_status(app_name: str, command_name: str):
    # Check if containers are running
    res = compose("ps --services --filter status=running", capture_output=True)
    running_containers = res.stdout.decode("utf-8").strip()
    if running_containers != "":
        console.print("[dim]Some containers are already running and up to date: ")
        console.print("  " + ", ".join(running_containers.split("\n")))
        console.print(
            f"[dim]To fully restart {app_name}, run [cyan]{command_name} restart[/cyan]"
            f" or [cyan]{command_name} up --force-recreate[/cyan]."
        )
    console.print()
    return running_containers


def follow_logs(app_name: str, command_name: str, container: str, **kwargs):
    console.print("[green bold]Following container logs")
    console.print(f"[dim]- Press Ctrl+c to exit ({app_name} will keep running).")
    console.print(
        f"[dim]- {app_name} can be stopped with the [cyan]{command_name} down[/cyan] command."
    )
    # Should integrate this into the macrostrat.utils.cmd function
    env = kwargs.pop("env", _build_compose_env())
    return Popen(
        ["docker", "compose", "logs", "-f", "--since=1s", container], env=env, **kwargs
    )

from os import environ

from macrostrat.app_frame import Application, DockerComposeManager
from macrostrat.app_frame.control_command import ControlCommand
from mapboard.core.settings import MAPBOARD_ROOT
from typer import Context, Option

from .config import environments

# Commands that inspect or change the environment rather than use it.
ENVIRONMENT_NEUTRAL = {"env", "config", None}


def prepare_compose_env(app) -> dict[str, str]:
    """Prepare the environment for docker-compose"""
    if environ.get("COMPOSE_PROFILES") != None:
        # We're using a user-set custom profile; don't override it
        return {}

    compose_profiles = []

    if environ.get("MAPBOARD_API_ADDRESS") == None:
        compose_profiles.append("production")

    return {"COMPOSE_PROFILES": " ".join(compose_profiles)}


class MapboardCommand(ControlCommand):
    def callback(
        self,
        ctx: Context,
        verbose: bool = Option(False, "--verbose"),
        # Already taken from argv when settings loaded; declared for the help text.
        env: str = Option(None, "--env", "-e", help="Environment for this command"),
    ):
        """:app_name: command-line interface"""
        super().callback(ctx, verbose=verbose)
        if ctx.invoked_subcommand not in ENVIRONMENT_NEUTRAL:
            environments.require_environment()


class MapboardApplication(Application):
    def __init__(self):
        super().__init__(
            "Mapboard",
            log_modules=[
                "mapboard.server",
                "mapboard.cli",
                "mapboard.topology_manager",
            ],
        )
        self.compose_manager = DockerComposeManager(
            self,
            root_dir=MAPBOARD_ROOT,
            compose_files=[MAPBOARD_ROOT / "system" / "docker-compose.yaml"],
            restart_commands={
                "gateway": "caddy reload --config /etc/caddy/Caddyfile",
            },
        )

    def control_command(self, *args, **kwargs):
        cmd = MapboardCommand(self, *args, **kwargs)
        self.compose_manager.add_commands(cmd)
        return cmd


core_app = MapboardApplication()
console = core_app.console

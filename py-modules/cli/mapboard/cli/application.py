from os import environ
from macrostrat.app_frame import Application, DockerComposeManager
from mapboard.core.settings import MAPBOARD_ROOT


def prepare_compose_env(app) -> dict[str, str]:
    """Prepare the environment for docker-compose"""
    if environ.get("COMPOSE_PROFILES") != None:
        # We're using a user-set custom profile; don't override it
        return {}

    compose_profiles = []

    if environ.get("MAPBOARD_API_ADDRESS") == None:
        compose_profiles.append("production")

    return {"COMPOSE_PROFILES": " ".join(compose_profiles)}


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
        cmd = super().control_command(*args, **kwargs)
        self.compose_manager.add_commands(cmd)
        return cmd


core_app = MapboardApplication()
console = core_app.console

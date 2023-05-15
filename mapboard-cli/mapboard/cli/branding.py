from rich.console import Console
from typing import Optional


class AppConfig:
    name: str
    command_name: str
    console: Console

    def __init__(self, name: str, *, command_name: Optional[str] = None):
        self.name = name
        self.command_name = command_name or name.lower()
        self.console = Console()
        super().__init__()

    def info(self, text, style=None):
        text = text.replace(":app_name:", self.name)
        text = text.replace(":command_name:", self.name.lower())
        self.console.print(text, style=style)

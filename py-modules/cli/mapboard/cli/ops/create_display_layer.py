from typer import Argument, Typer
from mapboard.core.database import setup_database

app = Typer(no_args_is_help=True)


@app.command()
def create_display_layer(
    project: str = Argument(..., help="Project name"),
    *,
    commit: bool = False,
):
    db = setup_database(project)

    # Get the display layer, or create it

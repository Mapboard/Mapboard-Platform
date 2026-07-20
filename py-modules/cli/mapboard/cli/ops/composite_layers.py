from typer import Typer
from mapboard.core.database import get_topology_manager
from macrostrat.utils import get_logger

log = get_logger(__name__)
app = Typer(no_args_is_help=True)


@app.command()
def update_composite_layers():
    """Update composite layers for a Mapboard project."""
    mgr = get_topology_manager("naukluft")

    # Get the display layer, or create it
    mgr.update(composite_layers=True)

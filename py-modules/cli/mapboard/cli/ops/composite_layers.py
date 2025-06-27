from typer import Argument, Typer
from mapboard.core.database import setup_database
from mapboard.topology_manager.commands.update import _update
from mapboard.topology_manager.commands.update_faces.composite_layers import (
    update_composite_layer,
)
from macrostrat.utils import get_logger

log = get_logger(__name__)
app = Typer(no_args_is_help=True)


@app.command()
def update_composite_layers():
    """Update composite layers for a Mapboard project."""
    db = setup_database("naukluft")

    # Get the display layer, or create it
    _update(db, composite_layers=False)

    layers = db.run_query(
        "SELECT id FROM {data_schema}.map_layer WHERE composited_from IS NOT NULL"
    ).scalars()

    # Polygons
    for layer in layers:
        log.info("Updating composite layer %s", layer)
        update_composite_layer(db, layer)

"""
Remove dangling edges from one or more layers.
"""

from pathlib import Path
from typer import Argument, Context, Option, Typer
from rich import print
from rich.prompt import Confirm

from mapboard.core.database import setup_database

here = Path(__file__).parent.resolve()

app = Typer(no_args_is_help=True)


@app.command()
def remove_dangling_edges(
    project: str = Argument(..., help="Project name"),
    *,
    max_length: float = None,
    commit: bool = False,
    map_layer: int = Option(None, "--layer", "-l"),
    line_type: str = Option(None, "--type", "-t"),
):
    """Remove dangling edges from a layer.

    Args:
        map_layer: The ID of the map layer to remove dangling edges from.
        tolerance: The tolerance for removing dangling edges.
    """
    db = setup_database(project)

    sql = (here / ".." / "procedures" / "get-dangling-edges.sql").read_text()

    # Construct a filter stack
    filters = []
    params = {}

    if max_length is None:
        raise ValueError("max_length must be provided")

    filters.append("ST_Length(e.geom) <= :max_length")
    params["max_length"] = max_length

    if map_layer is not None:
        filters.append("l.map_layer = :map_layer")
        params["map_layer"] = map_layer
    if line_type is not None:
        filters.append("l.type = :type")
        params["type"] = line_type
    if len(filters) == 0:
        filters = ["true"]
    filter_text = " AND ".join(filters)
    sql = sql.replace("{filters}", filter_text)

    edges = db.run_query(sql, params=params).all()

    if len(edges) == 0:
        print("No dangling edges found")
        return
    else:
        print(f"Found {len(edges)} dangling edges to remove")

    if not commit:
        # Prompt the user to confirm
        commit = Confirm.ask(
            "Are you sure you want to remove these edges?", default=False
        )

    if not commit:
        print("No changes made")
        return

    # Remove the dangling edges
    for edge in edges:
        db.run_query(
            """
            DELETE FROM {data_schema}.linework WHERE id = :id
            """,
            params={"edge_id": edge.id, "line_id": edge.line_id},
        )

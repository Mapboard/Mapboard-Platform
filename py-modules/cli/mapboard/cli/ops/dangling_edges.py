"""
Remove dangling edges from one or more layers.
"""

from pathlib import Path
from typer import Argument, Context, Option, Typer
from rich import print
from rich.prompt import Confirm
from sqlalchemy import text

from mapboard.core.database import setup_database

here = Path(__file__).parent.resolve()

app = Typer(no_args_is_help=True)


def get_procedure(key: str):
    """Get the SQL procedure for a given key."""
    sql = (here / ".." / "procedures" / f"{key}.sql").read_text()
    return sql


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

    sql = get_procedure("get-dangling-edges")

    filters = SQLFilters()

    if max_length is None:
        raise ValueError("max_length must be provided")

    filters.add("ST_Length(e.geom) <= :max_length", {"max_length": max_length})

    if map_layer is not None:
        filters.add("l.map_layer = :map_layer", {"map_layer": map_layer})
    if line_type is not None:
        filters.add("l.type = :type", {"type": line_type})
    sql = sql.replace("{filters}", str(filters))

    edges = db.run_query(sql, params=filters.params).all()

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
    with db.transaction():
        for edge in edges:
            print(
                f"Removing edge {edge.edge_id} from line {edge.line_id} ({edge.length:.2g} m)"
            )
            db.run_query(
                get_procedure("remove-edge-from-line"),
                params={
                    "edge_id": edge.edge_id,
                    "line_id": edge.line_id,
                },
            )


class SQLFilters:
    """A stack of filters for SQL queries."""

    def __init__(self):
        self.filters = []
        self.params = {}

    def add(self, _filter: str, params: dict = None):
        """Add a filter to the stack."""
        self.filters.append(_filter)
        if params is not None:
            self.params.update(params)

    def __str__(self):
        _filters = self.filters
        if len(_filters) == 0:
            return "true"
        return " AND ".join(_filters)

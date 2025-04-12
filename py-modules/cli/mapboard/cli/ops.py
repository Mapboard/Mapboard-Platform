from typing import Optional
from rich.console import Console
from macrostrat.database import Database
from rich import print
from typer import Typer

from mapboard.core.settings import connection_string, core_db
from mapboard.core.database import setup_database
from sys import stderr

app = Typer(name="ops", no_args_is_help=True)


@app.command(name="create-grid")
def create_grid_layer(
    project: str,
    parent: str,
    name: Optional[str] = None,
    spacing: Optional[float] = None,
):
    """Create a grid layer for a Mapboard project"""

    db = setup_database(project)

    # Get the parent layer
    parent_id = get_layer_id(db, parent)

    # Determine the extent of the layer

    extent = get_layer_extent(db, parent_id)
    print(extent)

    return

    # Create a grid layer if it doesn't exist
    grid_layer_id = create_layer("Grid", name=name, parent=parent_id, topological=False)
    create_linework_type(db, "Grid lines", layer_id=grid_layer_id)
    #


def get_layer_id(db: Database, name: str):
    """Get a layer by name"""
    sql = """
    SELECT id FROM {data_schema}.map_layer WHERE name = :name
    """
    return db.run_query(sql, params={"name": name}).scalar()


def create_layer(db: Database, name: str, *, parent: Optional[int] = None, topological: Optional[bool] = True):
    """Create a map layer"""
    sql = """
    INSERT INTO {data_schema}.map_layer (name, parent, topological)
    VALUES (:name, :parent, :topological)
    ON CONFLICT (name) DO NOTHING
    RETURNING id
    """
    return db.run_query(sql, params={"name": name, "parent": parent, "topological": topological}).scalar()


def create_linework_type(db: Database, name: str, layer_id: Optional[int] = None):
    """Create a data type"""
    sql = """
    INSERT INTO {data_schema}.linework_type (name)
    VALUES (:name, :layer_id)
    ON CONFLICT (name) DO NOTHING
    RETURNING id
    """
    id = db.run_query(sql, params={"name": name}).scalar()

    if layer_id is not None:
        db.run_query(
            """
            INSERT INTO map_topology.map_layer_linework_type (map_layer_id, linework_type_id)
            VALUES (:layer_id, :type_id) ON CONFLICT DO NOTHING
            """,
            params={"layer_id": layer_id, "type_id": id},
        )
    return id


def get_layer_extent(db: Database, layer_id: int):
    """Get the extent of a layer"""
    sql = """
    SELECT st_extent(geometry) FROM {data_schema}.linework WHERE map_layer = :layer_id
    """
    res = db.run_query(sql, params={"layer_id": layer_id}).scalar()
    # Parse coordinates
    assert res.startswith("BOX(")
    res = res[4:-1]
    coords = res.split(",")
    return [tuple(map(float, c.split())) for c in coords]

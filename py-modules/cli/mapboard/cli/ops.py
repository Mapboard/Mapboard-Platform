from typing import Optional
from rich.console import Console
from macrostrat.database import Database
from rich import print
from typer import Typer
from numpy import log10

from mapboard.core.settings import connection_string, core_db
from mapboard.core.database import setup_database
from sys import stderr
from shapely.geometry import MultiLineString

app = Typer(name="ops", no_args_is_help=True)


@app.command(name="create-grid")
def create_grid_layer(
    project: str,
    parent: str,
    spacing: Optional[float] = None,
    replace: bool = False,
):
    """Create a grid layer for a Mapboard project"""

    db = setup_database(project)

    # Get the parent layer
    parent_id = get_layer_id(db, parent)

    # Determine the extent of the layer

    (_min, _max) = get_layer_extent(db, parent_id)
    print(_min, _max)

    x_range = _max[0] - _min[0]
    y_range = _max[1] - _min[1]

    print(f"X range: {x_range}")
    print(f"Y range: {y_range}")

    if spacing is None:
        # Compute a spacing based on the extent

        # Use the max extent to determine the spacing
        rng = max(x_range, y_range)

        print(f"Max extent: {rng}")
        spacing = rng / 10
        # Round to the nearest power of 10

        ex = log10(spacing)

        print(ex)

        # Round to the nearest power of 10
        spacing = 10 ** round(ex)

    print(f"Spacing: {spacing}")

    x_range = range_round(_min[0], _max[0], spacing)
    y_range = range_round(_min[1], _max[1], spacing)

    # Number of squares
    n_x = int((x_range[1] - x_range[0]) / spacing)
    n_y = int((y_range[1] - y_range[0]) / spacing)
    n = n_x * n_y
    print(f"X range: {x_range}")
    print(f"Y range: {y_range}")
    print(f"Number of squares: {n}")

    print(f"Are you sure you want to generate {n} squares? (y/n)")
    if input().lower() != "y":
        print("Aborting")
        return

    # Create a grid layer if it doesn't exist
    grid_layer_id = create_layer(db, "Grid", parent=parent_id, topological=True)
    type_id = create_linework_type(db, "Grid lines", layer_id=grid_layer_id)

    if replace:
        # Clear existing grid geometries
        db.run_query(
            """
            DELETE FROM {data_schema}.linework WHERE map_layer = :grid_layer_id AND type = :type_id
            """,
            params={"grid_layer_id": grid_layer_id, "type_id": type_id},
        )

    # Create the grid
    for i in range(n_x + 1):
        # Create vertical lines
        coords = [
            (x_range[0] + i * spacing, y_range[0]),
            (x_range[0] + i * spacing, y_range[1]),
        ]
        insert_line(db, coords, grid_layer_id, type_id)

    for i in range(n_y + 1):
        # Create horizontal lines
        coords = [
            (x_range[0], y_range[0] + i * spacing),
            (x_range[1], y_range[0] + i * spacing),
        ]
        insert_line(db, coords, grid_layer_id, type_id)

    db.session.commit()


def insert_line(db: Database, coords: list, map_layer: int, linework_type: str):
    geom = MultiLineString([coords])
    sql = """
    INSERT INTO {data_schema}.linework (geometry, map_layer, type)
    SELECT :geom, :map_layer, :linework_type
    """
    db.run_query(sql, params={"geom": geom.wkb_hex, "map_layer": map_layer, "linework_type": linework_type})


def range_round(min, max, spacing):
    """Round a range to the nearest multiple of spacing"""
    min = min - (min % spacing)
    max = max - (max % spacing) + spacing
    return min, max


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
    ON CONFLICT DO NOTHING
    RETURNING id
    """
    return db.run_query(sql, params={"name": name, "parent": parent, "topological": topological}).scalar()


def create_linework_type(db: Database, name: str, layer_id: Optional[int] = None):
    """Create a data type"""
    id = name.lower().replace(" ", "-").replace("_", "-")

    sql = """
    INSERT INTO {data_schema}.linework_type (id, name)
    VALUES (:id, :name)
    ON CONFLICT (id) DO NOTHING
    RETURNING id
    """
    id = db.run_query(sql, params={"id": layer_id, "name": name}).scalar()

    if layer_id is not None:
        db.run_query(
            """
            INSERT INTO {data_schema}.map_layer_linework_type (map_layer, type)
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


@app.command(name="drop-layer")
def drop_layer(project: str, layer: str, force: bool = False):
    """Drop a layer from a Mapboard project"""

    db = setup_database(project)

    # Get the layer ID
    layer_id = get_layer_id(db, layer)

    # if has children, refuse to drop
    children = db.run_query(
        """
        SELECT name FROM {data_schema}.map_layer WHERE parent = :layer_id
        """,
        params={"layer_id": layer_id},
    ).all()

    if len(children) > 0:
        print(f"Layer {layer} has children: {children}, these must be dropped separately")
        return

    if force:
        # Drop all geometries in the layer
        db.run_query(
            """
            DELETE FROM {data_schema}.linework WHERE map_layer = :layer_id
            """,
            params={"layer_id": layer_id},
        )

        db.run_query(
            """
            DELETE FROM {data_schema}.map_layer_linework_type WHERE map_layer = :layer_id
            """,
            params={"layer_id": layer_id},
        )

        db.run_query(
            """
            DELETE FROM {data_schema}.map_layer_polygon_type WHERE map_layer = :layer_id
            """,
            params={"layer_id": layer_id},
        )

    # Drop the layer
    db.run_query(
        """
        DELETE FROM {data_schema}.map_layer WHERE id = :layer_id
        """,
        params={"layer_id": layer_id},
    )

    db.session.commit()

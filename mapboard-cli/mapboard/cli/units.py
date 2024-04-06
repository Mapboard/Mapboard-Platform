"""Command-line tools to manage units for a map."""

from .database import setup_database


def move_unit(
    project: str,
    unit: str,
    from_layer: str,
    to_layer: str,
    remove_from_old_layer: bool = True,
):
    """Move a unit to a new layer."""

    db = setup_database(project)

    # Get the IDs of the layers
    with db.transaction():
        db.run_query("SET search_path TO {data_schema},public")

        _q = "SELECT id FROM map_layer WHERE name = :name"
        from_layer_id: int = db.run_query(_q, dict(name=from_layer)).scalar()
        to_layer_id = db.run_query(_q, dict(name=to_layer)).scalar()

        # Insert the relevant row into the map_layer_polygon_type table
        db.run_query(
            "INSERT INTO map_layer_polygon_type (map_layer, type) VALUES (:to_layer, :unit) ON CONFLICT DO NOTHING",
            dict(unit=unit, to_layer=to_layer_id),
        )

        # Update the unit's layer
        db.run_query(
            "UPDATE polygon SET map_layer = :to_layer WHERE type = :unit AND map_layer = :from_layer",
            dict(unit=unit, from_layer=from_layer_id, to_layer=to_layer_id),
        )

        # Remove the unit from the old layer
        if remove_from_old_layer:
            db.run_query(
                "DELETE FROM map_layer_polygon_type WHERE map_layer = :from_layer AND type = :unit",
                dict(unit=unit, from_layer=from_layer_id),
            )

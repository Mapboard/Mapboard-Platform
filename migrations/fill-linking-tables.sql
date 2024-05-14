SET search_path = {data_schema},public;

INSERT INTO map_layer_linework_type (map_layer, type)
SELECT ml.id, t.id
FROM map_layer ml
CROSS JOIN linework_type t
ON CONFLICT DO NOTHING;

INSERT INTO map_layer_polygon_type(map_layer, type)
SELECT ml.id, t.id
FROM map_layer ml
CROSS JOIN polygon_type t
ON CONFLICT DO NOTHING;
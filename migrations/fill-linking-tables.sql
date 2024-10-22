SET search_path = {data_schema},public;

ALTER TABLE linework ADD COLUMN map_layer integer;

INSERT INTO map_layer_linework_type (map_layer, type)
SELECT ml.id, t.id
FROM map_layer ml
CROSS JOIN linework_type t
ON CONFLICT DO NOTHING;

ALTER TABLE polygon ADD COLUMN map_layer integer;

INSERT INTO map_layer_polygon_type(map_layer, type)
SELECT ml.id, t.id
FROM map_layer ml
CROSS JOIN polygon_type t
ON CONFLICT DO NOTHING;

UPDATE polygon SET
 map_layer = (SELECT min(id) FROM map_layer)
WHERE map_layer IS NULL;

UPDATE linework SET
  map_layer = (SELECT min(id) FROM map_layer)
WHERE map_layer IS NULL;

ALTER TABLE linework ALTER COLUMN map_layer SET not null;
ALTER TABLE polygon ALTER COLUMN map_layer SET not null;

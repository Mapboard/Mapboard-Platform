/** Create a new (non-topological) map layer to hold edges from stage 1 */
SET search_path TO {data_schema}, {topo_schema},public;

INSERT INTO map_layer (name, topological)
VALUES ('stage1-edges', false)
ON CONFLICT DO NOTHING;

INSERT INTO map_layer_linework_type (map_layer, type)
SELECT ml.id, 'boundary'
FROM map_layer ml
WHERE ml.name = 'stage1-edges'
ON CONFLICT DO NOTHING;

INSERT INTO linework (geometry, type, map_layer)
SELECT
    ST_Multi(geom),
    'boundary',
    (SELECT id FROM map_layer WHERE name = 'stage1-edges')
FROM edge_data
-- Only insert if we haven't already
WHERE (SELECT count(id) FROM linework WHERE map_layer = (
    SELECT id FROM map_layer WHERE name = 'stage1-edges')) = 0;


CREATE OR REPLACE VIEW {data_schema}.linework_ext AS
SELECT
    l.*,
    map_layer.name as map_layer_name
FROM linework l
JOIN map_layer ON l.map_layer = map_layer.id;

CREATE OR REPLACE VIEW {data_schema}.polygon_ext AS
SELECT
    p.*,
    map_layer.name as map_layer_name
FROM polygon p
JOIN map_layer ON p.map_layer = map_layer.id;

SELECT * FROM polygon WHERE source != 'expand-topology' AND source IS NOT null;

SELECT * FROM face_data WHERE ST_Area(geometry) < 10;

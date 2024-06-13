SET search_path TO {data_schema}, {topo_schema},public;

-- Polygon seed function
CREATE OR REPLACE FUNCTION {topo_schema}.build_polygon_seed(polygon geometry)
    RETURNS geometry AS
$$
DECLARE
    circle record;
    radius double precision;
BEGIN
    circle := ST_MaximumInscribedCircle(polygon);
    radius := least(greatest(circle.radius/2, 10), 100);
    RETURN ST_Intersection(ST_Buffer(circle.center, radius), ST_Buffer(polygon, -circle.radius/4));
END;
$$
LANGUAGE plpgsql;

-- Create map layers for topological data
INSERT INTO {data_schema}.map_layer (name, description, topological)
SELECT name || '_topo', description || ' with Mapboard topology', true
FROM {data_schema}.map_layer
WHERE topological = false
ON CONFLICT (name) DO NOTHING;

-- Create linework types for boundaries
INSERT INTO {data_schema}.linework_type (id, name)
SELECT 'boundary', 'Boundary'
ON CONFLICT DO NOTHING;

-- Allow boundaries to be edited in all map layers
INSERT INTO map_layer_linework_type (map_layer, type)
SELECT id, 'boundary'
FROM map_layer
WHERE topological = true
ON CONFLICT DO NOTHING;

INSERT INTO map_layer_polygon_type (map_layer, type)
SELECT
    ml2.id,
    p.type
FROM map_layer_polygon_type p
 JOIN map_layer ml
      ON p.map_layer = ml.id
          AND NOT ml.topological
 JOIN map_layer ml2
      ON ml2.name = ml.name || '_topo'
          AND ml2.topological
ON CONFLICT DO NOTHING;

-- Delete existing polygon seeds and boundaries
DELETE FROM linework WHERE source = 'init';
DELETE FROM polygon WHERE source = 'init';

--- Polygon seeds
INSERT INTO polygon (geometry, type, map_layer, source)
SELECT
    ST_Multi(build_polygon_seed(geometry)) geometry,
    p.type,
    ml2.id map_layer,
    'init'
FROM polygon p
         JOIN map_layer ml
              ON ml.id = p.map_layer
                  AND NOT ml.topological
         JOIN map_layer ml2
              ON ml2.name = ml.name || '_topo';

--- Polygon boundaries
INSERT INTO linework (geometry, type, map_layer, source)
SELECT
    ST_Multi(ST_Boundary(geometry)),
    'boundary',
    ml2.id map_layer,
    'init'
FROM polygon p
 JOIN map_layer ml
      ON ml.id = p.map_layer
    AND NOT ml.topological
 JOIN map_layer ml2
    ON ml2.name = ml.name || '_topo';

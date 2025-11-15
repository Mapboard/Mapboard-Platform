SET search_path TO cross_section, mapping, public;

-- Declare a variable to hold the new linework type
DO $$
DECLARE
  layer_id integer;
  bedrock_id integer;
  outcrop_id integer;
  nnc_id integer;
  nappes_id integer;
BEGIN

INSERT INTO linework_type (id, name, color)
VALUES ('terrain', 'Terrain', '#000000'),
      ('bounds', 'Bounds', '#888888')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  color = EXCLUDED.color;


-- Insert a corresponding layer
INSERT INTO map_layer (name, topological)
VALUES ('Context', true)
ON CONFLICT (name) DO UPDATE SET
  topological = true
RETURNING id INTO layer_id;

INSERT INTO map_layer_linework_type (type, map_layer)
VALUES ('terrain', layer_id),
      ('bounds', layer_id)
ON CONFLICT DO NOTHING;

-- Create sky and subsurface units and add them to the polygon types for the context
INSERT INTO cross_section.polygon_type (id, name, color)
VALUES ('sky', 'Sky', '#005A9C'),
       ('subsurface', 'Subsurface', '#ffffff')
ON CONFLICT DO NOTHING;

INSERT INTO map_layer_polygon_type (type, map_layer)
VALUES ('sky', layer_id),
       ('subsurface', layer_id)
ON CONFLICT DO NOTHING;

-- Create a bounds box
DELETE FROM linework
WHERE type = 'terrain' AND map_layer = layer_id;

INSERT INTO cross_section.linework (geometry, type, map_layer)
SELECT ST_Multi(
  ST_SetSRID(
    ST_Scale(vertical_geom, 1, cross_section.vertical_exaggeration()),
    3857
  )
), 'terrain', layer_id
FROM cross_section.section;

DELETE FROM linework WHERE type = 'bounds' AND map_layer = layer_id;

INSERT INTO linework (map_layer, type, geometry)
SELECT layer_id, 'bounds', ST_ExteriorRing(
  ST_MakeEnvelope(
    1,
    (vertical_offset-10000+4000)*vertical_exaggeration(),
    ST_Length(s.geometry)-2,
    (vertical_offset+3000)*vertical_exaggeration()
  )
)
FROM cross_section.section s
ON CONFLICT DO NOTHING;

/* Create a layer for bedrock synced to the units
and line types of the main mapping schema. */

-- Layers for data

/** Hierarchical layers for tectonic elements */
INSERT INTO map_layer (name, topological, parent)
VALUES ('Nappe complex', true, layer_id)
ON CONFLICT (name) DO UPDATE SET
  topological = true,
  parent = layer_id
RETURNING id INTO nnc_id;

/** Create a layer for nappes */
INSERT INTO map_layer (name, topological, parent)
VALUES ('Nappes', true, nnc_id)
ON CONFLICT (name) DO UPDATE SET
  topological = true,
  parent = nnc_id
RETURNING id INTO nappes_id;

INSERT INTO map_layer (name, topological, parent)
VALUES ('Bedrock', true, nappes_id)
ON CONFLICT (name) DO UPDATE SET
  topological = true,
  parent = nappes_id
RETURNING id INTO bedrock_id;

/** Create empty layer for outcrop polygons */
INSERT INTO map_layer (name, topological, parent)
VALUES ('Outcrop', true, layer_id)
ON CONFLICT (name) DO UPDATE SET
  topological = false,
  parent = layer_id
RETURNING id INTO outcrop_id;



WITH poly_types AS (
INSERT INTO polygon_type (id, name, color, symbol, symbol_color)
SELECT id, name, color, symbol, symbol_color
FROM map_digitizer.polygon_type
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  color = EXCLUDED.color,
  symbol = EXCLUDED.symbol,
  symbol_color = EXCLUDED.symbol_color
RETURNING id
)
INSERT INTO map_layer_polygon_type (type, map_layer)
SELECT id, bedrock_id FROM poly_types
UNION ALL
SELECT id, outcrop_id FROM poly_types
UNION ALL
SELECT id, nappes_id FROM poly_types
UNION ALL
SELECT id, nnc_id FROM poly_types
ON CONFLICT DO NOTHING;

WITH linework_types AS (
INSERT INTO linework_type (id, name, color)
SELECT id, name, color
FROM map_digitizer.linework_type
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  color = EXCLUDED.color
RETURNING id
)
INSERT INTO map_layer_linework_type (type, map_layer)
SELECT id, bedrock_id FROM linework_types
ON CONFLICT DO NOTHING;

DELETE FROM polygon
WHERE map_layer = outcrop_id;

WITH sec_unit AS (
SELECT
  s.id,
  unit_id,
  s.geometry,
  ST_StartPoint(s.geometry) AS start,
  ST_EndPoint(s.geometry) AS end_,
  (ST_Dump(ST_Intersection(f.geometry, s.geometry))).geom geom
FROM map_topology.map_face f
JOIN cross_section.section s
  ON ST_Intersects(f.geometry, s.geometry)
WHERE f.map_layer = (SELECT id FROM map_digitizer.map_layer WHERE name = 'Bedrock')
),
indexed AS (
SELECT
  *,
  ST_Distance(start, geom) AS startpt,
  (ST_Length(geometry)-ST_Distance(end_,geom)) AS endpt
FROM sec_unit
),
s1 AS (
SELECT
  unit_id,
  ST_Intersection(
    ST_MakeEnvelope(
      startpt,
      (vertical_offset-10000+4000)*vertical_exaggeration(),
      endpt,
      (vertical_offset+3000)*vertical_exaggeration()
    ),
    ST_Buffer(ST_Scale(vertical_geom, 1, vertical_exaggeration()), 20)
  ) geom
FROM indexed i
JOIN cross_section.section s
  ON s.id = i.id
ORDER BY i.id, start
)
INSERT INTO polygon (map_layer, type, geometry)
SELECT outcrop_id, unit_id, ST_Buffer(geom, 0)
FROM s1
WHERE ST_IsEmpty(geom) = false
  AND unit_id IS NOT NULL;

END $$;



WITH a AS (
SELECT
  id,
  (ST_Dump(geometry)).geom geometry,
  type,
  name,
  created,
  certainty,
  zoom_level,
  pixel_width,
  map_width,
  map_layer,
  source
FROM {data_schema}.linework
WHERE ST_NumGeometries(geometry) > 1
),
b AS (
  INSERT INTO {data_schema}.linework (
    geometry,
    type,
    name,
    created,
    certainty,
    zoom_level,
    pixel_width,
    map_width,
    map_layer,
    source
  )
  SELECT
    geometry,
    type,
    name,
    created,
    certainty,
    zoom_level,
    pixel_width,
    map_width,
    map_layer,
    source
  FROM a
)
DELETE FROM {data_schema}.linework
WHERE id IN (SELECT id FROM a);

-- Same thing for polygons
WITH a AS (
SELECT
  id,
  (ST_Dump(geometry)).geom geometry,
  type,
  name,
  created,
  certainty,
  zoom_level,
  pixel_width,
  map_width,
  map_layer,
  source
FROM {data_schema}.polygon
WHERE ST_NumGeometries(geometry) > 1
),
b AS (
  INSERT INTO {data_schema}.polygon (
    geometry,
    type,
    name,
    created,
    certainty,
    zoom_level,
    pixel_width,
    map_width,
    map_layer,
    source
  )
  SELECT
    geometry,
    type,
    name,
    created,
    certainty,
    zoom_level,
    pixel_width,
    map_width,
    map_layer,
    source
  FROM a
)
DELETE FROM {data_schema}.polygon
WHERE id IN (SELECT id FROM a);

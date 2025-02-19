TRUNCATE TABLE mapboard.linework_type CASCADE;
TRUNCATE TABLE mapboard.polygon_type CASCADE;
TRUNCATE TABLE mapboard.linework CASCADE;
TRUNCATE TABLE mapboard.polygon CASCADE;
TRUNCATE TABLE mapboard.map_layer CASCADE;

-- This should be a separate migration
ALTER TABLE map_digitizer.polygon
  ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE mapboard.polygon
  ADD COLUMN IF NOT EXISTS name text;

INSERT INTO
  mapboard.map_layer (
  id,
  name,
  description,
  parent,
  topological)
SELECT
  id,
  name,
  description,
  parent,
  topological
FROM
  map_digitizer.map_layer;

INSERT INTO
  mapboard.linework_type (
  id,
  name,
  color)
SELECT
  id,
  name,
  color
FROM
  map_digitizer.linework_type;

INSERT INTO
  mapboard.polygon_type (
  id,
  name,
  color)
SELECT
  id,
  name,
  color
FROM
  map_digitizer.polygon_type;

INSERT INTO
  mapboard.map_layer_linework_type (
  map_layer,
  type)
SELECT
  map_layer,
  type
FROM
  map_digitizer.map_layer_linework_type;

INSERT INTO
  mapboard.map_layer_polygon_type (
  map_layer,
  type)
SELECT
  map_layer,
  type
FROM
  map_digitizer.map_layer_polygon_type;

INSERT INTO
  mapboard.polygon (
  id,
  geometry,
  type,
  map_layer,
  created,
  name,
  certainty,
  zoom_level,
  pixel_width,
  map_width,
  source)
SELECT
  id,
  geometry,
  type,
  map_layer,
  created,
  name,
  certainty,
  zoom_level,
  pixel_width,
  map_width,
  source
FROM
  map_digitizer.polygon;

INSERT INTO
  mapboard.linework (
  id,
  geometry,
  type,
  map_layer,
  created,
  name,
  certainty,
  zoom_level,
  pixel_width,
  map_width,
  source)
SELECT
  id,
  geometry,
  type,
  map_layer,
  created,
  name,
  certainty,
  zoom_level,
  pixel_width,
  map_width,
  source
FROM
  map_digitizer.linework;

-- Reset primary key sequences
SELECT setval('mapboard.map_layer_id_seq', (SELECT greatest(max(id), 1) FROM mapboard.map_layer));

SELECT setval('mapboard.linework_id_seq', (SELECT greatest(max(id), 1) FROM mapboard.linework));
SELECT setval('mapboard.polygon_id_seq', (SELECT greatest(max(id), 1) FROM mapboard.polygon));

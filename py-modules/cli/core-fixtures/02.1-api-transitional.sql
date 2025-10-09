/** Foreign data wrappers and transitional schemas
  * These are used to import data from the naukluft database into the mapboard database.
  * The schemas are transitional and will eventually be merged into the main mapboard database.
 */
CREATE EXTENSION IF NOT EXISTS postgres_fdw;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

CREATE SERVER IF NOT EXISTS naukluft
  FOREIGN DATA WRAPPER postgres_fdw
  OPTIONS (host 'localhost', dbname 'naukluft');

CREATE USER MAPPING IF NOT EXISTS FOR CURRENT_USER
  SERVER naukluft
  OPTIONS (user 'mapboard_admin');

/* Mirror the 'cross_section' schemas to the mapboard database */
DROP SCHEMA IF EXISTS naukluft_cross_sections CASCADE;
CREATE SCHEMA IF NOT EXISTS naukluft_cross_sections;
IMPORT FOREIGN SCHEMA cross_section
  FROM SERVER naukluft
  INTO naukluft_cross_sections;

/* Mirror the map data schema to the mapboard database */
DROP SCHEMA IF EXISTS naukluft_map_data CASCADE;
CREATE SCHEMA IF NOT EXISTS naukluft_map_data;
IMPORT FOREIGN SCHEMA map_digitizer
  FROM SERVER naukluft
  INTO naukluft_map_data;


/** TRANSITIONAL APIs
  * Here we define API schemas that are used to support common features that will eventually
  be merged between projects. For now, they just unify tables by UNIONing the same structure
  between different projects. We'll eventually move to a more unified schema.
 */

DROP VIEW IF EXISTS mapboard_api.polygon_type;
CREATE OR REPLACE VIEW mapboard_api.polygon_type AS
WITH s1 AS (
  SELECT
    p.id AS project_id,
    p.slug project_slug,
    c.data_schema,
    c.id AS context_id,
    c.slug AS context_slug
  FROM mapboard.project p
  JOIN mapboard.context c
    ON p.id = c.project_id
)
SELECT
  s1.*,
  pt.*
FROM naukluft_map_data.polygon_type pt
JOIN s1 ON
     s1.project_slug = 'naukluft'
      AND s1.data_schema = 'map_digitizer';

CREATE OR REPLACE VIEW mapboard_api.stations AS
SELECT
  id,
  (SELECT id FROM mapboard.project WHERE slug = 'naukluft') AS project_id,
  'naukluft' AS project_slug,
  ST_Transform(geometry, 4326) AS geometry,
  type,
  name,
  uuid,
  notes,
  altitude,
  strike,
  dip,
  trend,
  plunge,
  overturned,
  vertical,
  horizontal,
  "date",
  unit_id,
  unit_name,
  cleavage,
  bedding,
  lineation,
  fold_axis,
  fault,
  source,
  data
FROM naukluft_map_data.stations;

CREATE OR REPLACE VIEW mapboard_api.cross_sections AS
SELECT id,
       project_id,
       replace(name, 'Section ', '') AS name,
       parent AS parent_id,
       is_public,
       offset_x,
       offset_y,
       ST_Length(parent_geom) length,
       ST_Transform(ST_LineMerge(parent_geom), 4236) geometry -- we store multilinestrings for some reason
FROM mapboard.context
WHERE type = 'cross-section'
  AND parent_geom IS NOT null;

CREATE OR REPLACE VIEW mapboard_api.cross_section_endpoints AS
SELECT
  cs.id,
  cs.project_id,
  cs.name,
  cs.parent_id,
  cs.is_public,
  'start' AS end_type,
  ST_StartPoint(geometry) geometry
FROM mapboard_api.cross_sections cs
UNION ALL
SELECT
  cs.id,
  cs.project_id,
  cs.name,
  cs.parent_id,
  cs.is_public,
  'end' AS end_type,
  ST_EndPoint(geometry) geometry
FROM mapboard_api.cross_sections cs;

DROP VIEW IF EXISTS mapboard_api.piercing_points;
CREATE OR REPLACE VIEW mapboard_api.piercing_points AS
WITH cross_sections AS (
  SELECT id,
         project_id,
         replace(name, 'Section ', '') AS name,
         parent AS parent_id,
         is_public,
         ST_LineMerge(parent_geom) geometry -- we store multilinestrings for some reason
  FROM mapboard.context
  WHERE type = 'cross-section'
   AND parent_geom IS NOT null
)
SELECT
  s1.project_id,
  p.slug project_slug,
  s1.parent_id,
  s1.id,
  s2.id other_id,
  s1.name,
  s2.name other_name,
  (s1.is_public AND s2.is_public) is_public,
  ST_Intersection(s1.geometry, s2.geometry) geometry,
  ST_Length(s1.geometry) * ST_LineLocatePoint(s1.geometry, ST_Intersection(s1.geometry, s2.geometry)) distance,
  ST_Length(s2.geometry) * ST_LineLocatePoint(s2.geometry, ST_Intersection(s1.geometry, s2.geometry)) other_distance
FROM cross_sections s1
JOIN cross_sections s2
  ON ST_Intersects(s1.geometry, s2.geometry)
 AND s1.id != s2.id
 AND s1.project_id = s2.project_id
 AND s1.parent_id = s2.parent_id
JOIN mapboard.project p
  ON s1.project_id = p.id;

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
  cleavage,
  bedding,
  lineation,
  fold_axis,
  source,
  data
FROM naukluft_map_data.stations;

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

DROP VIEW IF EXISTS mapboard_api.cross_sections CASCADE;
CREATE OR REPLACE VIEW mapboard_api.cross_sections AS
SELECT id,
       project_id,
       replace(name, 'Section ', '') AS name,
       parent AS parent_id,
       is_public,
       offset_x,
       offset_y,
       ST_Length(parent_geom) length,
       ST_LineMerge(ST_Transform(parent_geom, 4326)) geometry -- we store multilinestrings for some reason
FROM mapboard.context
WHERE type = 'cross-section'
  AND parent_geom IS NOT null;


DROP VIEW IF EXISTS mapboard_api.cross_sections CASCADE;
CREATE OR REPLACE VIEW mapboard_api.cross_sections AS
WITH
  cross_sections AS (
    SELECT id,
           slug,
           project_id,
           replace(name, 'Section ', '') AS name,
           parent AS parent_id,
           is_public,
           offset_x,
           offset_y,
           parent_geom -- we store multilinestrings for some reason
    FROM mapboard.context
    WHERE type = 'cross-section'
     AND parent_geom IS NOT null
  ),
  candidate_matches AS (SELECT c1.id,
                               c1.slug,
                                  c1.name,
                                  c2.id                                    context_id,
                                  c2.slug                                  context_slug,
                                  c1.project_id,
                                  c1.parent_id,
                                  c1.is_public,
                                  c1.offset_x,
                                  c1.offset_y,
                                  ST_LineMerge(c1.parent_geom) AS cross_section_geom,
                                  ST_Transform(c2.bounds, c2.srid)      AS map_bounds
                           FROM cross_sections c1
                                  JOIN mapboard.context c2
                                       ON c1.project_id = c2.project_id
                           WHERE c2.type = 'map'),
     v1 AS (
       SELECT *,
              NOT ST_Contains(map_bounds, cross_section_geom) AS is_clipped,
              ST_Intersection(cross_section_geom, map_bounds) AS clipped_geom
       FROM candidate_matches c
       WHERE ST_Intersects(cross_section_geom, map_bounds)
     ),
     split AS (SELECT (ST_Dump(clipped_geom)).geom,
                      (ST_Dump(clipped_geom)).path part,
                      id,
                      slug,
                      name,
                      cross_section_geom,
                      is_public,
                      is_clipped,
                      offset_x,
                      offset_y,
                      map_bounds,
                      project_id,
                      parent_id,
                      context_id
               FROM v1),
     sections AS (SELECT id,
                         slug,
                       name,
                       CASE array_length(part, 1) > 0 WHEN true THEN part ELSE null END AS part,
                       context_id clip_context_id,
                       parent_id parent_context_id,
                       project_id,
                       is_public,
                       is_clipped,
                       ST_Length(geom) as length,
                       ST_Length(cross_section_geom) * ST_LineLocatePoint(cross_section_geom, ST_StartPoint(geom)) clip_distance,
                       ST_Length(cross_section_geom) * ST_LineLocatePoint(cross_section_geom, ST_StartPoint(geom)) + offset_x AS offset_x,
                       offset_y,
                       ST_Transform(geom, 4326) AS geometry,
                       ST_SRID(geom) AS original_srid
                FROM split
                UNION ALL
                SELECT
                  id,
                  slug,
                  name,
                  null,
                  null,
                  parent_id,
                  project_id,
                  is_public,
                  false,
                  ST_Length(parent_geom),
                  0,
                  offset_x,
                  offset_y,
                  ST_LineMerge(ST_Transform(parent_geom, 4326)),
                  ST_SRID(parent_geom)
                FROM cross_sections)
SELECT
    s.*,
    p.slug project_slug,
    c.slug clip_context_slug,
    c1.slug parent_context_slug
FROM sections s
JOIN mapboard.project p
  ON s.project_id = p.id
JOIN mapboard.context c1
  ON s.parent_context_id = c1.id
LEFT JOIN mapboard.context c
  ON s.clip_context_id = c.id
ORDER BY project_id, is_clipped, name;

DROP VIEW IF EXISTS mapboard_api.cross_section_endpoints;
CREATE OR REPLACE VIEW mapboard_api.cross_section_endpoints AS
SELECT
  cs.id,
  cs.slug,
  cs.project_id,
  cs.project_slug,
  cs.name,
  cs.clip_context_id,
  cs.clip_context_slug,
  cs.parent_context_id,
  cs.parent_context_slug,
  cs.is_public,
  'start' AS end_type,
  ST_StartPoint(geometry) geometry
FROM mapboard_api.cross_sections cs
UNION ALL
SELECT
  cs.id,
  cs.slug,
  cs.project_id,
  cs.project_slug,
  cs.name,
  cs.clip_context_id,
  cs.clip_context_slug,
  cs.parent_context_id,
  cs.parent_context_slug,
  cs.is_public,
  'end',
  ST_EndPoint(geometry)
FROM mapboard_api.cross_sections cs;

DROP VIEW IF EXISTS mapboard_api.piercing_points;
CREATE OR REPLACE VIEW mapboard_api.piercing_points AS
WITH cross_sections AS (
  SELECT id,
         slug,
         project_id,
         project_slug,
         name,
         parent_context_id,
         parent_context_slug,
         clip_context_id,
         clip_context_slug,
         is_public,
         ST_Transform(geometry, original_srid) geometry -- we store multilinestrings for some reason
  FROM mapboard_api.cross_sections cs
)
SELECT
  s1.id,
  s1.slug,
  s1.project_id,
  s1.project_slug,
  s1.clip_context_id,
  s1.clip_context_slug,
  s1.parent_context_id,
  s1.parent_context_slug,
  s2.id other_id,
  s1.name,
  s2.name other_name,
  (s1.is_public AND s2.is_public) is_public,
  ST_Transform(ST_Intersection(s1.geometry, s2.geometry), 4326) geometry,
  ST_Length(s1.geometry) * ST_LineLocatePoint(s1.geometry, ST_Intersection(s1.geometry, s2.geometry)) distance,
  ST_Length(s2.geometry) * ST_LineLocatePoint(s2.geometry, ST_Intersection(s1.geometry, s2.geometry)) other_distance
FROM cross_sections s1
JOIN cross_sections s2
  ON ST_Intersects(s1.geometry, s2.geometry)
 AND s1.id != s2.id
 AND s1.project_id = s2.project_id
 AND s1.parent_context_id = s2.parent_context_id
  -- If clip context exists, it must be the same
 AND ((s1.clip_context_id IS NULL AND s2.clip_context_id IS NULL)
  OR s1.clip_context_id = s2.clip_context_id)
JOIN mapboard.project p
  ON s1.project_id = p.id;


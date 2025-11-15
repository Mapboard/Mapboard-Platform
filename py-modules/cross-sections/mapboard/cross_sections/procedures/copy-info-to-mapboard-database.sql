/** Copy cross section metadata to the mapboard database */

/** Create a remote connection to the naukluft database */
CREATE EXTENSION IF NOT EXISTS postgres_fdw;

CREATE SERVER IF NOT EXISTS naukluft
  FOREIGN DATA WRAPPER postgres_fdw
  OPTIONS (host 'localhost', dbname 'naukluft');

CREATE USER MAPPING IF NOT EXISTS FOR CURRENT_USER
  SERVER naukluft
  OPTIONS (user 'mapboard_admin');

/* Mirror the 'cross_section' schemas to the mapboard database */
CREATE SCHEMA IF NOT EXISTS naukluft_cross_sections;
IMPORT FOREIGN SCHEMA cross_section
  FROM SERVER naukluft
  INTO naukluft_cross_sections;

CREATE SCHEMA IF NOT EXISTS naukluft_map_data;
IMPORT FOREIGN SCHEMA map_digitizer
  FROM SERVER naukluft
  INTO naukluft_map_data;

/** Copy cross section metadata to the mapboard database */
WITH
  prj AS (SELECT
            id
          FROM
            mapboard.project
          WHERE
            slug = 'naukluft')
INSERT
INTO mapboard.context (
  project_id,
  name,
  slug,
  type,
  database,
  data_schema,
  topo_schema,
  srid,
  tolerance,
  offset_y,
  parent,
  parent_geom,
  uuid
)
SELECT
    (SELECT id FROM prj) AS project_id,
    'Section ' || s.id AS name,
    'section-' || lower(s.id),
    'cross-section',
    'naukluft',
    'cross_section',
    'cross_section_topology',
    3857,
    0.1,
    vertical_offset,
    (SELECT
       ctx.id
     FROM
       mapboard.context ctx,
       prj
     WHERE
         slug = 'map'
     AND project_id = prj.id),
    s.geometry,
    hash
FROM
  naukluft_cross_sections.section s
WHERE 'Section ' || s.id NOT IN (
    SELECT
      name
    FROM
      mapboard.context
    WHERE
      type = 'cross-section'
  );

/** Create bounding polygons around sections */
UPDATE mapboard.context c
SET
  bounds = st_setsrid(st_makeenvelope(
                        0,
                        (offset_y - 3000),
                        st_length(c.parent_geom),
                        (offset_y + 3000)
                      ), 3857)
WHERE type = 'cross-section'
  AND c.parent_geom IS NOT NULL;


/** Update project boundaries for Naukluft project */
UPDATE
  mapboard.context
SET
  -- location for namibia
  bounds = st_setsrid(st_makeenvelope(15.89, -24.6, 16.36, -24.08), 4326),
  name = 'Main map',
  slug = 'map'
WHERE
    project_id = mapboard.project_id('naukluft')
AND type = 'map';

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
    s.name,
    s.id,
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
         slug = 'main'
     AND project_id = prj.id),
    linework.geometry,
    hash
FROM
  naukluft_cross_sections.section s
  JOIN naukluft_map_data.linework
    ON line_id = linework.id;

/** Create bounding polygons around sections */
UPDATE mapboard.context c
SET
  bounds = st_setsrid(st_makeenvelope(
                        0,
                        (offset_y - 10000 + 4000),
                        st_length(c.parent_geom),
                        (offset_y + 3000)
                      ), 3857)
WHERE
    type = 'cross-section'
AND project_id = (SELECT id FROM mapboard.project WHERE slug = 'naukluft');

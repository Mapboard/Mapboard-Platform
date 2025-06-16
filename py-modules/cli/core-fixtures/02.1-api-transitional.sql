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
      AND s1.data_schema = 'map_digitizer'
UNION ALL
SELECT
  s1.*,
  pt2.*
FROM naukluft_cross_sections.polygon_type pt2
JOIN s1 ON
  s1.project_slug = 'naukluft'
AND s1.data_schema = 'cross_section';

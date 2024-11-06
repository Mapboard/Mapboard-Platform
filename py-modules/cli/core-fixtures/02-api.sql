CREATE SCHEMA IF NOT EXISTS mapboard_api;

CREATE OR REPLACE VIEW mapboard_api.users AS
SELECT * FROM public.users;

CREATE OR REPLACE VIEW mapboard_api.projects AS
SELECT * FROM public.projects;

CREATE OR REPLACE VIEW mapboard_api.project AS
SELECT
  p.*,
  ctx.slug                      AS main_context_slug,
  (SELECT
     count(*)
   FROM
     mapboard.context context
   WHERE
     context.project_id = p.id) AS n_contexts
FROM
  mapboard.project p
  LEFT JOIN mapboard.context ctx
    ON p.main_context = ctx.id;

CREATE OR REPLACE VIEW mapboard_api.context AS
SELECT
  c.*,
  p.main_context = c.id AS is_main_context,
  p.slug                AS project_slug
FROM
  mapboard.context c
  JOIN mapboard.project p
    ON c.project_id = p.id;

/* Create bounds for main context */

UPDATE mapboard.context c
SET
  bounds = (SELECT
              st_envelope(st_union(st_envelope(geometry)))
            FROM
              naukluft_map_data.linework)
WHERE
    c.slug = 'main'
AND c.project_id = mapboard.project_id('naukluft');

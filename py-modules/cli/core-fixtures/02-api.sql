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

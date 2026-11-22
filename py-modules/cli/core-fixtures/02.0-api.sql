CREATE SCHEMA IF NOT EXISTS mapboard_api;

-- Named columns: `SELECT *` would publish email addresses.
DROP VIEW IF EXISTS mapboard_api.users;
CREATE OR REPLACE VIEW mapboard_api.users AS
SELECT id, username, created_at, name, sub FROM public.users;

CREATE OR REPLACE VIEW mapboard_api.project AS
SELECT
  p.*,
  ctx.slug                      AS main_context_slug,
  (SELECT
     count(*)
   FROM
     mapboard.context context
   WHERE
     context.project_id = p.id) AS n_contexts,
  mapboard.project_access(p.id, mapboard.current_user_id()) AS access
FROM
  mapboard.project p
  LEFT JOIN mapboard.context ctx
    ON p.main_context = ctx.id
-- Only PostgREST's roles are filtered: mapboard_server and the CLI read these views
-- as the database owner and must see every project.
WHERE current_user NOT IN ('web_anon', 'web_user')
   OR mapboard.project_access(p.id, mapboard.current_user_id()) IS NOT NULL;

CREATE OR REPLACE VIEW mapboard_api.context AS
SELECT
  c.id,
  c.project_id,
  c.name,
  c.slug,
  c.description,
  c.uuid,
  canvas_id,
  ca.slug                      AS canvas_slug,
  ca.uuid                      AS canvas_uuid,
  ca.type,
  c.created_at,
  c.is_public,
  ca.srid,
  ca.tolerance,
  ca.database,
  ca.data_schema,
  ca.topo_schema,
  ca.legacy,
  ST_Xmax(c.bounds) - ST_Xmin(c.bounds) AS length,
  st_transform(c.bounds, 4326) AS bounds,
  c.parent,
  st_transform(c.parent_geom, 4326) AS parent_geom,
  c.offset_x,
  c.offset_y,
  p.main_context = c.id        AS is_main,
  p.slug                       AS project_slug,
  p.title                      AS project_name,
  p.uuid                       AS project_uuid,
  -- Base layers
  (SELECT jsonb_agg(
      jsonb_delete(
        row_to_json(r)::jsonb,
        'context_id',
        'id'
      )
    )
    FROM mapboard.base_layer r
    JOIN mapboard.context_base_layer cl
      ON r.id = cl.base_layer_id
    WHERE cl.context_id = c.id
  ) layers
FROM
  mapboard.context c
  JOIN mapboard.project p
    ON c.project_id = p.id
  JOIN mapboard.canvas ca
    ON c.canvas_id = ca.id
    AND ca.project_id = p.id
-- Only PostgREST's roles are filtered: mapboard_server and the CLI read these views
-- as the database owner and must see every project.
WHERE current_user NOT IN ('web_anon', 'web_user')
   OR mapboard.project_access(p.id, mapboard.current_user_id()) IS NOT NULL;


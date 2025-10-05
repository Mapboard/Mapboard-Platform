CREATE SCHEMA IF NOT EXISTS mapboard_api;

CREATE OR REPLACE VIEW mapboard_api.users AS
SELECT * FROM public.users;

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
  c.id,
  c.project_id,
  c.name,
  c.slug,
  c.description,
  c.uuid,
  c.type,
  c.created_at,
  c.srid,
  c.tolerance,
  c.database,
  c.data_schema,
  c.topo_schema,
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
    WHERE context_id = c.id
  ) layers
FROM
  mapboard.context c
  JOIN mapboard.project p
    ON c.project_id = p.id;


CREATE OR REPLACE VIEW mapboard_api.stations AS
SELECT * FROM naukluft_map_data.stations;

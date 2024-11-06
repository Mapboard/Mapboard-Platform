SELECT
  id,
  description,
  created_at,
  database,
  owner_id,
  srid,
  slug,
  title,
  uuid,
  data_schema,
  topo_schema,
  tolerance
FROM
  projects;


INSERT
  INTO mapboard.project (
  id,
  description,
  created_at,
  owner_id,
  srid,
  slug,
  title,
  uuid
)
SELECT
  id,
  description,
  created_at,
  owner_id,
  srid,
  slug,
  title,
  uuid
FROM
  projects;

INSERT INTO mapboard.context (
  project_id,
  name,
  slug,
  type,
  created_at,
  database,
  data_schema,
  topo_schema,
  srid,
  tolerance
)
SELECT
  id,
  'Main',
  'main',
  'map',
  created_at,
  database,
  data_schema,
  topo_schema,
  srid,
  tolerance
FROM
  projects;


-- Set the 'main context' for each project

UPDATE
  mapboard.project p
SET
  main_context = c.id
FROM
  mapboard.context c
WHERE
    c.project_id = p.id
AND c.slug = 'main';

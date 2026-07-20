/**
  Inventory of every non-system schema owned by a project in the merged
  (schema-based multi-tenant) database.

  A project owns:
    - canvas schemas  — topology-managed data + topology pairs (one per canvas),
                        also described by mapboard.canvas
    - auxiliary schemas — arbitrary project-scoped data (e.g. geochemistry,
                        stratigraphic sections, field photos), carried over from
                        the project's original standalone database
    - a base schema    — project data that lived in the original database's
                        `public` schema, collected into one namespaced schema

  This table is the single place that answers "which schemas belong to this
  project", which makes arbitrary project-scoped schemas a first-class,
  ongoing capability (creation, listing, teardown, access control) rather than
  something implied only by a naming convention.
 */

CREATE TABLE IF NOT EXISTS mapboard.project_schema (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id  integer NOT NULL REFERENCES mapboard.project (id) ON DELETE CASCADE,
  -- Set for canvas-related schemas; null for auxiliary / base schemas.
  canvas_id   integer REFERENCES mapboard.canvas (id) ON DELETE CASCADE,
  -- The actual (namespaced) schema name in the merged database.
  schema_name text NOT NULL UNIQUE,
  -- The schema's name in the project's original standalone database
  -- (for `base`, the constant 'public'). Kept for provenance / debugging.
  source_name text,
  -- 'api' is reserved for a future per-project PostgREST overlay schema (views over
  -- the project's mb_* schemas); not yet produced by the migration. See docs/architecture.md.
  kind        text NOT NULL
                CHECK (kind IN ('canvas_data', 'canvas_topo', 'auxiliary', 'base', 'api')),
  created_at  timestamp DEFAULT current_timestamp,
  UNIQUE (project_id, schema_name)
);

COMMENT ON TABLE mapboard.project_schema IS
  'Inventory of every non-system schema owned by a project in the merged database.';

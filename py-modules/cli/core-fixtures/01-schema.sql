/** Schema for the Mapboard project management database */

CREATE SCHEMA IF NOT EXISTS mapboard;

DROP VIEW IF EXISTS mapboard_api.context CASCADE;
DROP VIEW IF EXISTS mapboard_api.project CASCADE;

CREATE TABLE IF NOT EXISTS public.users (
  id         serial PRIMARY KEY,
  username   text NOT NULL UNIQUE,
  created_at timestamp DEFAULT current_timestamp
);

CREATE TABLE IF NOT EXISTS mapboard.project (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug        text NOT NULL UNIQUE,
  uuid        uuid NOT NULL DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  description text,
  created_at  timestamp DEFAULT current_timestamp,
  owner_id    integer REFERENCES public.users (id),
  srid        integer NOT NULL REFERENCES public.spatial_ref_sys (srid) DEFAULT 4326,
  derived_from integer REFERENCES mapboard.project (id)
);

-- TODO(reserved-name): 'mapboard' should be reserved as a project slug (it's the core
-- schema and would collide with the mb_ prefix). This was a CHECK (slug NOT LIKE 'mapboard%'),
-- but a CHECK fires on *every* UPDATE of a matching row and blocked delete_project_metadata's
-- `SET main_context = NULL` on grandfathered rows. Re-add as a BEFORE INSERT OR UPDATE OF slug
-- trigger (enforces on create/rename only, not maintenance updates or deletes).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'mapboard' AND t.typname = 'context_type') THEN
    CREATE TYPE mapboard.context_type AS enum ('map', 'cross-section');
  END IF;
END $$;

-- A mapping canvas is a view within a project that shares a single topology and
-- set of contexts.
CREATE TABLE IF NOT EXISTS mapboard.canvas (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id  integer NOT NULL REFERENCES mapboard.project (id),
  type        mapboard.context_type NOT NULL DEFAULT 'map',
  -- Short identifier, unique within the project. Used as the canvas segment of the
  -- project's schema names (mb_<slug>_<uuid8>_<canvas-slug>_{data,topo}); kept short
  -- so those names stay within Postgres's 63-char identifier limit.
  slug        text,
  uuid        uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at  timestamp DEFAULT current_timestamp,
  database    text NOT NULL,
  data_schema text NOT NULL,
  topo_schema text NOT NULL,
  srid        integer REFERENCES public.spatial_ref_sys (srid) DEFAULT 4326,
  tolerance   numeric NOT NULL DEFAULT 0.00001,
  legacy      boolean DEFAULT false,
  UNIQUE (project_id, type, database, data_schema, topo_schema)
);

-- Canvas slug: add on existing databases, and enforce per-project uniqueness + a
-- length bound (idempotently). NULL slugs are allowed for un-migrated legacy canvases
-- (Postgres treats NULLs as distinct in a UNIQUE index).
ALTER TABLE mapboard.canvas ADD COLUMN IF NOT EXISTS slug text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'canvas_project_slug_unique') THEN
    ALTER TABLE mapboard.canvas ADD CONSTRAINT canvas_project_slug_unique UNIQUE (project_id, slug);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'canvas_slug_length') THEN
    ALTER TABLE mapboard.canvas ADD CONSTRAINT canvas_slug_length
      CHECK (slug IS NULL OR char_length(slug) BETWEEN 1 AND 24);
  END IF;
END $$;


CREATE TABLE IF NOT EXISTS mapboard.context (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id  integer NOT NULL REFERENCES mapboard.project (id),
  canvas_id   integer NOT NULL REFERENCES mapboard.canvas (id),
  name        text NOT NULL,
  description text,
  slug        text NOT NULL,
  uuid        uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at  timestamp DEFAULT current_timestamp,
  bounds      geometry(MultiPolygon),
  is_public   boolean DEFAULT true,
  parent      integer REFERENCES mapboard.context (id),
  parent_geom geometry(Geometry),
  offset_x    numeric DEFAULT 0,
  offset_y    numeric DEFAULT 0,
  UNIQUE (project_id, slug)
);

ALTER TABLE mapboard.project
  ADD COLUMN IF NOT EXISTS main_context integer REFERENCES mapboard.context (id);

-- Check that bounds do not overlap with other contexts in the same data_schema, database combo
CREATE OR REPLACE FUNCTION mapboard.check_bounds_overlap()
  RETURNS trigger AS
$$
BEGIN
  IF exists (SELECT
               1
             FROM
               mapboard.context c
             WHERE
               c.canvas_id = new.canvas_id
             AND c.bounds && new.bounds
             AND c.id <> new.id) THEN
    RAISE EXCEPTION 'Bounds overlap with another context in the same data_schema, database combo';
  END IF;
  RETURN new;
END;
$$ LANGUAGE plpgsql;

-- CREATE TRIGGER check_bounds_overlap
--   BEFORE INSERT OR UPDATE
--   ON mapboard.context
--   FOR EACH ROW
-- EXECUTE FUNCTION mapboard.check_bounds_overlap();

-- Overlapping contexts are OK, actually...
DROP TRIGGER IF EXISTS check_bounds_overlap ON mapboard.context;

/** Base layers
 Table that defines standardized base layers for mapboard contexts.

 Base layers of several types can be defined, including:
 - DEMs
 - Imagery

 Base layers can either be tile service URLs or COGs that will be served as tiles.
 */

CREATE TABLE IF NOT EXISTS mapboard.base_layer (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  description text,
  type        text NOT NULL, -- e.g. 'dem', 'imagery'
  url         text NOT NULL, -- URL to tile service or COG
  created_at  timestamp DEFAULT current_timestamp
);

CREATE TABLE IF NOT EXISTS mapboard.context_base_layer (
  context_id    integer REFERENCES mapboard.context (id) ON DELETE CASCADE,
  base_layer_id integer REFERENCES mapboard.base_layer (id) ON DELETE CASCADE,
  PRIMARY KEY (context_id, base_layer_id)
);


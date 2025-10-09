/** Schema for the Mapboard project management database */

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA IF NOT EXISTS mapboard;

DROP VIEW IF EXISTS mapboard_api.context;
DROP VIEW IF EXISTS mapboard_api.project;

CREATE TABLE IF NOT EXISTS users (
  id         serial PRIMARY KEY,
  username   text NOT NULL UNIQUE,
  created_at timestamp DEFAULT current_timestamp
);

CREATE TABLE IF NOT EXISTS mapboard.project (
  id          serial PRIMARY KEY,
  slug        text NOT NULL UNIQUE,
  uuid        uuid NOT NULL DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  description text,
  created_at  timestamp DEFAULT current_timestamp,
  owner_id    integer REFERENCES users (id),
  srid        integer NOT NULL REFERENCES spatial_ref_sys (srid) DEFAULT 4326
);

CREATE TYPE mapboard.context_type AS enum ('map', 'cross-section');

CREATE TABLE IF NOT EXISTS mapboard.context (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id  integer NOT NULL REFERENCES mapboard.project (id),
  name        text NOT NULL,
  description text,
  slug        text NOT NULL,
  uuid        uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  type        mapboard.context_type NOT NULL,
  created_at  timestamp DEFAULT current_timestamp,
  database    text NOT NULL,
  data_schema text NOT NULL,
  topo_schema text NOT NULL,
  srid        integer REFERENCES spatial_ref_sys (srid) DEFAULT 4326,
  tolerance   numeric NOT NULL DEFAULT 0.00001,
  bounds      geometry(MultiPolygon),
  is_public   boolean DEFAULT true,
  parent      integer REFERENCES mapboard.context (id),
  parent_geom geometry(Geometry),
  offset_x    numeric DEFAULT 0,
  offset_y    numeric DEFAULT 0,
  UNIQUE (project_id, slug)
);

ALTER TABLE mapboard.context
  ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT true;


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
                 c.database = new.database
             AND c.data_schema = new.data_schema
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
  context_id  integer REFERENCES mapboard.context (id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  type        text NOT NULL, -- e.g. 'dem', 'imagery'
  url         text NOT NULL, -- URL to tile service or COG
  created_at  timestamp DEFAULT current_timestamp
);

/** Schema for the Mapboard project management database */

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA IF NOT EXISTS mapboard;

CREATE TABLE IF NOT EXISTS users
(
  id         SERIAL PRIMARY KEY,
  username   TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mapboard.project
(
  id          SERIAL PRIMARY KEY,
  slug        TEXT    NOT NULL UNIQUE,
  uuid        UUID    NOT NULL                                   DEFAULT gen_random_uuid(),
  title       TEXT    NOT NULL,
  description TEXT,
  created_at  TIMESTAMP                                          DEFAULT CURRENT_TIMESTAMP,
  owner_id    INTEGER REFERENCES users (id),
  srid        INTEGER NOT NULL REFERENCES spatial_ref_sys (srid) DEFAULT 4326
);

CREATE TYPE mapboard.context_type AS ENUM ('map', 'cross-section');

CREATE TABLE IF NOT EXISTS mapboard.context
(
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id  INTEGER               NOT NULL REFERENCES mapboard.project (id),
  name        text,
  slug        text,
  uuid        UUID                  NOT NULL            DEFAULT gen_random_uuid(),
  type        mapboard.context_type NOT NULL,
  created_at  TIMESTAMP                                 DEFAULT CURRENT_TIMESTAMP,
  database    TEXT                  NOT NULL,
  data_schema TEXT                  NOT NULL,
  topo_schema TEXT                  NOT NULL,
  srid        INTEGER REFERENCES spatial_ref_sys (srid) DEFAULT 4326,
  tolerance   numeric               NOT NULL            DEFAULT 0.00001,
  bounds      geometry(MultiPolygon),
  parent      INTEGER REFERENCES mapboard.context (id),
  parent_geom geometry(Geometry),
);

-- Check that bounds do not overlap with other contexts in the same data_schema, database combo
CREATE OR REPLACE FUNCTION mapboard.check_bounds_overlap()
  RETURNS TRIGGER AS
$$
BEGIN
  IF EXISTS (SELECT 1
             FROM mapboard.context c
             WHERE c.database = NEW.database
               AND c.data_schema = NEW.data_schema
               AND c.bounds && NEW.bounds
               AND c.id <> NEW.id) THEN
    RAISE EXCEPTION 'Bounds overlap with another context in the same data_schema, database combo';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_bounds_overlap
  BEFORE INSERT OR UPDATE
  ON mapboard.context
  FOR EACH ROW
  EXECUTE FUNCTION mapboard.check_bounds_overlap();

/*
This table representation serves as a minimal interface that must
be implemented for a schema's compatibility with the Mapboard server.
*/
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA IF NOT EXISTS {data_schema};
CREATE SCHEMA IF NOT EXISTS {topo_schema};

CREATE TABLE {topo_schema}.subtopology (
  id text PRIMARY KEY
);

CREATE TABLE {data_schema}.map_layer (
  id            serial PRIMARY KEY,
  name          text,
  description   text,
  topological   boolean NOT NULL DEFAULT true,
  parent        integer CHECK (id != parent) REFERENCES {data_schema}.map_layer(id),
  position      integer NOT NULL DEFAULT 0
);

INSERT INTO {data_schema}.map_layer (id, name, description, topological, parent, position)
SELECT 0, 'default', 'Default layer', true, NULL, 0
WHERE NOT EXISTS (SELECT * FROM {data_schema}.map_layer WHERE id = 0);

CREATE TABLE {data_schema}.linework_type (
    id text PRIMARY KEY,
    name text,
    color text,
    topology text,
    FOREIGN KEY (topology) REFERENCES {topo_schema}.subtopology(id) ON UPDATE CASCADE
);

CREATE TABLE {data_schema}.linework (
  id            serial PRIMARY KEY,
  geometry      public.geometry(MultiLineString, {srid}) NOT NULL,
  type          text,
  created       timestamp without time zone DEFAULT now(),
  certainty     integer,
  zoom_level    integer,
  pixel_width   numeric,
  map_width     numeric,
  hidden        boolean DEFAULT false,
  source        text,
  name          text,
  layer         integer DEFAULT 0 NOT NULL REFERENCES {data_schema}.map_layer(id),
  FOREIGN KEY (type) REFERENCES {data_schema}.linework_type(id) ON UPDATE CASCADE
);
CREATE INDEX {index_prefix}_linework_geometry_idx ON {data_schema}.linework USING gist (geometry);

/*
Table to define feature types for polygon mode

It is typical usage to manually replace this table
with a view that refers to features from another table
(e.g. map units from a more broadly-defined table representation)

Other columns can also be added to this table as appropriate
*/

CREATE TABLE {data_schema}.polygon_type (
    id text PRIMARY KEY,
    name text,
    color text,
    -- Optional, for display...
    symbol text,
    symbol_color text,
    topology text,
    FOREIGN KEY (topology) REFERENCES {topo_schema}.subtopology(id) ON UPDATE CASCADE
);

CREATE TABLE {data_schema}.polygon (
  id            serial PRIMARY KEY,
  geometry      public.geometry(MultiPolygon, {srid}) NOT NULL,
  type          text,
  created       timestamp without time zone DEFAULT now(),
  certainty     integer,
  zoom_level    integer,
  pixel_width   numeric,
  map_width     numeric,
  hidden        boolean DEFAULT false,
  source        text,
  name          text,
  layer         integer DEFAULT 0 NOT NULL REFERENCES {data_schema}.map_layer(id),
  FOREIGN KEY (type) REFERENCES {data_schema}.polygon_type(id) ON UPDATE CASCADE
);
CREATE INDEX {index_prefix}_polygon_geometry_idx ON {data_schema}.polygon USING gist (geometry);


/** Utility functions tied to a specific schema */
CREATE OR REPLACE FUNCTION {data_schema}.linework_srid()
RETURNS integer AS
$$
SELECT srid FROM geometry_columns
WHERE f_table_schema = {data_schema_name} 
  AND f_table_name = 'linework'
  AND f_geometry_column = 'geometry'
$$ LANGUAGE SQL IMMUTABLE;

CREATE OR REPLACE FUNCTION {data_schema}.polygon_srid()
RETURNS integer AS
$$
SELECT srid FROM geometry_columns
WHERE f_table_schema = {data_schema_name}
  AND f_table_name = 'polygon'
  AND f_geometry_column = 'geometry'
$$ LANGUAGE SQL IMMUTABLE;
/** Functions for managing "spots"
  Right now this only works for the NNC station data but it can be extended to other
  systems in the future.
  */

CREATE TABLE IF NOT EXISTS {data_schema}.stations (
  id SERIAL PRIMARY KEY,
  geometry geometry(Geometry, {srid_literal}) not null,
  type text NOT NULL, -- this could be controlled later
  uuid uuid DEFAULT gen_random_uuid() UNIQUE,
  name text,
  notes text,
  altitude numeric,
  strike numeric,
  dip numeric,
  trend numeric,
  plunge numeric,
  "date" date,
  unit_name text,
  unit_id text REFERENCES {data_schema}.polygon_type(id),
  cleavage boolean,
  bedding boolean,
  lineation boolean,
  fold_axis boolean,
  fault boolean,
  source text,
  data jsonb,
  overturned boolean,
  vertical boolean GENERATED ALWAYS AS (dip >= 89) STORED,
  horizontal boolean GENERATED ALWAYS AS (coalesce(dip < 1, plunge <= 1, false)) STORED
);

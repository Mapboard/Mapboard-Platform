/** Functions for managing "spots"
  Right now this only works for the NNC station data but it can be extended to other
  systems in the future.
  */

DROP TABLE IF EXISTS {data_schema}.stations CASCADE;

CREATE TABLE {data_schema}.stations (
  id SERIAL PRIMARY KEY,
  geometry geometry(Geometry, {srid}) not null,
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
  unit_id text REFERENCES {data_schema}.polygon_type(id),
  cleavage boolean,
  bedding boolean,
  lineation boolean,
  fold_axis boolean,
  source text,
  data jsonb,
  overturned boolean,
  vertical boolean GENERATED ALWAYS AS (dip >= 89) STORED,
  horizontal boolean GENERATED ALWAYS AS (coalesce(dip < 1, plunge <= 1, false)) STORED
);

-- Import NNC orientations to stations
-- This is temporary
-- TODO: use a better function to import
INSERT INTO {data_schema}.stations (
  geometry,
  type,
  name,
  uuid,
  notes,
  altitude,
  strike,
  dip,
  trend,
  plunge,
  overturned,
  "date",
  unit_id,
  cleavage,
  bedding,
  lineation,
  fold_axis
)
SELECT DISTINCT ON (geometry, date, strike, dip, trend, plunge, overturned, plane_type)
  geometry,
  plane_type,
  null,
    -- a uuid that will be stable across imports of the same data
   md5(concat(geometry, date, strike, dip, trend, plunge, overturned, plane_type)::bytea)::uuid,
  notes,
  altitude,
  strike,
  dip,
  trend,
  plunge,
  overturned,
  "date",
  unit_id,
  cleavage,
  bedding,
  lineation,
  fold_axis
FROM mapping.orientation;


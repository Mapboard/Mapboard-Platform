/** Functions for managing "spots"
  Right now this only works for the NNC station data but it can be extended to other
  systems in the future.
  */

DROP TABLE IF EXISTS {data_schema}.stations CASCADE;

CREATE TABLE {data_schema}.stations (
  id SERIAL PRIMARY KEY,
  geometry geometry(Point, {srid}) not null,
  type text NOT NULL, -- this could be controlled later
  name text,
  notes text,
  altitude numeric,
  strike numeric,
  dip numeric,
  trend numeric,
  plunge numeric,
  overturned boolean,
  "date" date,
  unit_id text REFERENCES {data_schema}.polygon_type(id),
  cleavage boolean,
  bedding boolean,
  lineation boolean,
  fold_axis boolean,
  source text,
  data jsonb
);

-- Import NNC orientations to stations
-- This is temporary
INSERT INTO {data_schema}.stations (
  geometry,
  type,
  name,
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
SELECT
  geometry,
  plane_type,
  null,
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


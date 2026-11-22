/** One-time import of NNC orientations into a project's stations.
  Run with `mapboard db run <project> import-nnc-stations`. */

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
  unit_name,
  unit_id,
  cleavage,
  bedding,
  lineation,
  fold_axis,
  fault
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
  unit_name,
  unit_id,
  cleavage,
  bedding,
  lineation,
  fold_axis,
  fault
FROM mapping.orientation;


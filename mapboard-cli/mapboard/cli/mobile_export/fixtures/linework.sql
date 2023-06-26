SELECT
  id,
  geometry::geometry geometry,
  null AS arbitrary,
  certainty,
  "type",
  map_width,
  pixel_width,
  created::text created
FROM map_digitizer.linework

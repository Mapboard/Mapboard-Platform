SELECT
  id,
  geometry::geometry geometry,
  NULL as arbitrary,
  certainty,
  type,
  map_width,
  pixel_width,
  created::text created
FROM map_digitizer.polygon

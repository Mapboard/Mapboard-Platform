SELECT
  id,
  ST_AsEWKT(geometry) geometry,
  certainty,
  type,
  map_width,
  pixel_width,
  created,
  layer
FROM mapboard.polygon;
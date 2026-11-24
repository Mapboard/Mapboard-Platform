/**
 * Prune rows for items that aren't represented in particular layers.
 */
DELETE FROM {data_schema}.map_layer_linework_type mt
WHERE NOT EXISTS (
  SELECT
  FROM {data_schema}.linework l
  WHERE l.map_layer = mt.map_layer
  AND l.type = mt.type
);

DELETE FROM {data_schema}.map_layer_polygon_type mt
WHERE NOT EXISTS (
  SELECT
  FROM {data_schema}.polygon l
  WHERE l.map_layer = mt.map_layer
  AND l.type = mt.type
);
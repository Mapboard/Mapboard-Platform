DELETE FROM {data_schema}.linework WHERE ST_IsEmpty(geometry);

-- Other duplicates
WITH dups AS (
  SELECT *,
      ROW_NUMBER() OVER (
      PARTITION BY geometry, map_layer, type
      ORDER BY id
      ) as row_num
  FROM {data_schema}.linework
)
DELETE FROM map_digitizer.linework
WHERE id IN (SELECT id FROM dups WHERE row_num > 1);

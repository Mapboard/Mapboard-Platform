/** For now we set the desired vertical exaggeration in this function. */
CREATE OR REPLACE FUNCTION cross_section.vertical_exaggeration()
  RETURNS numeric AS
$$
SELECT 1;
$$ LANGUAGE SQL;

CREATE TABLE IF NOT EXISTS cross_section.meta
(
  exaggeration numeric NOT NULL DEFAULT 1,
  spacing      numeric NOT NULL DEFAULT 10000
);

INSERT INTO cross_section.meta (exaggeration, spacing)
SELECT 1, 10000
WHERE NOT EXISTS (SELECT 1 FROM cross_section.meta);

/** Sync sections with map_digitizer.linework so they can be displayed as layers.
  We may change how this works in the future to allow for more flexibility
 */
DO $$
DECLARE
  layer_id integer;
BEGIN

  SELECT id INTO layer_id
  FROM map_digitizer.map_layer
  WHERE name = 'Sections';

  -- Sync sections into the map layer
  INSERT INTO map_digitizer.linework (name, type, map_layer, geometry)
  SELECT
    s.id,
    'cross-section',
    layer_id,
    geometry
  FROM cross_section.section s
  WHERE NOT EXISTS (
    SELECT 1
    FROM map_digitizer.linework l
    WHERE l.name = s.id
    AND l.map_layer = layer_id
  );

  -- Delete sections that no longer exist
  DELETE FROM map_digitizer.linework l
  WHERE l.map_layer = layer_id
  AND l.type = 'cross-section'
  AND NOT EXISTS (
    SELECT 1
    FROM cross_section.section s
    WHERE s.id = l.name
  );

  -- Update geometry of all sections
  UPDATE map_digitizer.linework l
  SET geometry = s.geometry
  FROM cross_section.section s
  WHERE l.name = s.id
  AND l.map_layer = layer_id
  AND ST_IsValid(s.geometry)
  AND l.type = 'cross-section';

END $$;

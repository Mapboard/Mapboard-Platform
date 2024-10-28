/*
This table representation serves as a minimal interface that must
be implemented for a schema's compatibility with the Mapboard server.
*/

-- We haven't solidified the API around this yet
ALTER TABLE {data_schema}.map_layer ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;

INSERT INTO {data_schema}.map_layer (id, name, topological, position)
SELECT 0, 'Default layer', true, 0
WHERE NOT EXISTS (SELECT * FROM {data_schema}.map_layer WHERE id = 0);


/** Linework table extensions for the Mapboard GIS app */
ALTER TABLE {data_schema}.linework ADD COLUMN IF NOT EXISTS certainty integer;
ALTER TABLE {data_schema}.linework ADD COLUMN IF NOT EXISTS zoom_level integer;
ALTER TABLE {data_schema}.linework ADD COLUMN IF NOT EXISTS pixel_width numeric;
ALTER TABLE {data_schema}.linework ADD COLUMN IF NOT EXISTS map_width numeric;
ALTER TABLE {data_schema}.linework ADD COLUMN IF NOT EXISTS source text;


ALTER TABLE {data_schema}.polygon ADD COLUMN IF NOT EXISTS certainty integer;
ALTER TABLE {data_schema}.polygon ADD COLUMN IF NOT EXISTS zoom_level integer;
ALTER TABLE {data_schema}.polygon ADD COLUMN IF NOT EXISTS pixel_width numeric;
ALTER TABLE {data_schema}.polygon ADD COLUMN IF NOT EXISTS map_width numeric;
ALTER TABLE {data_schema}.polygon ADD COLUMN IF NOT EXISTS source text;

/** Utility functions tied to a specific schema */
CREATE OR REPLACE FUNCTION {data_schema}.linework_srid()
RETURNS integer AS
$$
SELECT srid FROM geometry_columns
WHERE f_table_schema = :data_schema_name 
  AND f_table_name = 'linework'
  AND f_geometry_column = 'geometry'
$$ LANGUAGE SQL IMMUTABLE;

CREATE OR REPLACE FUNCTION {data_schema}.polygon_srid()
RETURNS integer AS
$$
SELECT srid FROM geometry_columns
WHERE f_table_schema = :data_schema_name
  AND f_table_name = 'polygon'
  AND f_geometry_column = 'geometry'
$$ LANGUAGE SQL IMMUTABLE;
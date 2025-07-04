/** Merge arbitrary-bedrock-contact and arbitrary-surficial-contact types */

-- We need to update the map_layer_linework_type table simultaneously

INSERT INTO {data_schema}.linework_type (id, name, color)
SELECT 'mapboard:arbitrary', 'Arbitrary contact', '#aaaaaa'
WHERE NOT EXISTS (
    SELECT 1 FROM {data_schema}.linework_type WHERE id = 'mapboard:arbitrary'
);

WITH update_map_layer_linework_type AS (
    UPDATE {data_schema}.map_layer_linework_type
    SET type = 'mapboard:arbitrary'
    WHERE type IN ('arbitrary-bedrock-contact', 'arbitrary-surficial-contact')
)
UPDATE {data_schema}.linework
SET type = 'mapboard:arbitrary'
WHERE type IN ('arbitrary-bedrock-contact', 'arbitrary-surficial-contact');

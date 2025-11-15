/** Merge arbitrary-bedrock-contact and arbitrary-surficial-contact types */

-- We need to update the map_layer_linework_type table simultaneously

INSERT INTO {data_schema}.linework_type (id, name, color)
SELECT 'mapboard:arbitrary', 'Arbitrary contact', '#aaaaaa'
WHERE NOT EXISTS (
    SELECT 1 FROM {data_schema}.linework_type WHERE id = 'mapboard:arbitrary'
);

INSERT INTO {data_schema}.map_layer_linework_type (map_layer, type)
SELECT map_layer, 'mapboard:arbitrary'
FROM {data_schema}.map_layer_linework_type
WHERE type IN ('arbitrary-bedrock', 'arbitrary-bedrock-contact', 'arbitrary-surficial-contact')
ON CONFLICT DO NOTHING;

UPDATE {data_schema}.linework
SET type = 'mapboard:arbitrary'
WHERE type IN ('arbitrary-bedrock','arbitrary-bedrock-contact', 'arbitrary-surficial-contact');

DELETE FROM {data_schema}.map_layer_linework_type
WHERE type IN ('arbitrary-bedrock', 'arbitrary-bedrock-contact', 'arbitrary-surficial-contact');

DELETE FROM {data_schema}.linework_type
WHERE id IN ('arbitrary-bedrock', 'arbitrary-bedrock-contact', 'arbitrary-surficial-contact');

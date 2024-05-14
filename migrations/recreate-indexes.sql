-- Drop existing primary key constraints
ALTER TABLE {data_schema}.linework DROP CONSTRAINT IF EXISTS linework_pkey CASCADE;
ALTER TABLE {data_schema}.polygon DROP CONSTRAINT IF EXISTS polygon_pkey CASCADE;
ALTER TABLE {data_schema}.linework DROP CONSTRAINT IF EXISTS linework_id_seq CASCADE;
ALTER TABLE {data_schema}.polygon DROP CONSTRAINT IF EXISTS polygon_id_seq CASCADE;

-- Drop a bunch of possible names for the sequences
DROP SEQUENCE IF EXISTS {data_schema}.polygon_id_seq CASCADE;
DROP SEQUENCE IF EXISTS {data_schema}.linework_id_seq CASCADE;
DROP INDEX IF EXISTS linework_pkey;
DROP INDEX IF EXISTS polygon_pkey;
DROP INDEX IF EXISTS {data_schema}.linework_id_seq CASCADE;
DROP INDEX IF EXISTS {data_schema}.polygon_id_seq CASCADE;

-- Recreate primary key constraints with new sequences
CREATE SEQUENCE {data_schema}.polygon_id_seq;
CREATE SEQUENCE {data_schema}.linework_id_seq;

ALTER TABLE map_digitizer.polygon ALTER COLUMN id SET DEFAULT nextval(:data_schema_name || '.polygon_id_seq');
ALTER TABLE map_digitizer.linework ALTER COLUMN id SET DEFAULT nextval(:data_schema_name || '.linework_id_seq');

-- Reset sequences
SELECT setval(:data_schema_name || '.polygon_id_seq', (SELECT MAX(id) FROM {data_schema}.polygon));
SELECT setval(:data_schema_name || '.linework_id_seq', (SELECT MAX(id) FROM {data_schema}.linework));

-- Create the primary key constraints
ALTER TABLE {data_schema}.linework ADD PRIMARY KEY (id);
ALTER TABLE {data_schema}.polygon ADD PRIMARY KEY (id);
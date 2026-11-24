/** Recreate primary key indexes for linework and polygon tables */

-- Drop existing primary key constraints
ALTER TABLE map_digitizer.linework DROP CONSTRAINT IF EXISTS linework_pkey;
ALTER TABLE map_digitizer.polygon DROP CONSTRAINT IF EXISTS polygon_pkey;

-- Recreate primary key constraints with new sequences
DROP SEQUENCE IF EXISTS map_digitizer.polygon_id_seq CASCADE;
DROP SEQUENCE IF EXISTS map_digitizer.linework_id_seq CASCADE;
DROP INDEX IF EXISTS linework_id_seq;
DROP INDEX IF EXISTS polygon_id_seq
CREATE SEQUENCE map_digitizer.polygon_id_seq;
CREATE SEQUENCE map_digitizer.linework_id_seq;

ALTER TABLE map_digitizer.linework ADD PRIMARY KEY (id);
ALTER TABLE map_digitizer.polygon ADD PRIMARY KEY (id);
ALTER TABLE map_digitizer.polygon ALTER COLUMN id SET DEFAULT nextval('map_digitizer.polygon_id_seq');
ALTER TABLE map_digitizer.linework ALTER COLUMN id SET DEFAULT nextval('map_digitizer.linework_id_seq');

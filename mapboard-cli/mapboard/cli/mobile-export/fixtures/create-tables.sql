-- Autoincrement prevents the reuse of values over the database lifetime.
CREATE TABLE map_layer (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  topological BOOLEAN NOT NULL DEFAULT 1,
  parent INTEGER CHECK (id != parent) REFERENCES map_layer(id),
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE mapboard_config (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE polygon_type (
  id TEXT PRIMARY KEY,
  name TEXT,
  color TEXT,
  topology TEXT
);


CREATE TABLE linework_type (
  id TEXT PRIMARY KEY,
  name TEXT,
  color TEXT,
  topology TEXT
);

INSERT INTO map_layer (id, name, description, topological, parent, position)
VALUES (1, 'default', 'Default layer', 1, NULL, 0)
WHERE NOT EXISTS (
  SELECT * FROM map_layer
);

INSERT INTO linework_type (id, name, color, topology)
VALUES ('default', 'Default', '#000000', 'main')
WHERE NOT EXISTS (
  SELECT * FROM linework_type
);

INSERT INTO polygon_type (id, name, color, topology)
VALUES ('default', 'Default', '#000000', 'main')
WHERE NOT EXISTS (
  SELECT * FROM polygon_type
);


CREATE TABLE polygon (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  certainty INTEGER,
  type TEXT NOT NULL DEFAULT 'default' REFERENCES polygon_type(id),
  map_width FLOAT,
  pixel_width FLOAT,
  created DATETIME,
  layer INTEGER NOT NULL DEFAULT 1 REFERENCES map_layer(id)
);


CREATE TABLE linework (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  certainty INTEGER,
  type TEXT NOT NULL DEFAULT 'default' REFERENCES linework_type(id),
  map_width FLOAT,
  pixel_width FLOAT,
  created DATETIME,
  layer INTEGER NOT NULL DEFAULT 1 REFERENCES map_layer(id)
);

-- Add geometry columns
SELECT AddGeometryColumn('polygon', 'geometry', :SRID, 'MULTIPOLYGON', 'XY', 1);
SELECT AddGeometryColumn('linework', 'geometry', :SRID, 'MULTILINESTRING', 'XY', 1);

SELECT CreateSpatialIndex('polygon','geometry');
SELECT CreateSpatialIndex('linework','geometry');

-- Save space in spatial reference system tables
DELETE FROM spatial_ref_sys_aux WHERE srid NOT IN (:SRID, 3857, 4326, -1);
DELETE FROM spatial_ref_sys WHERE srid NOT IN (:SRID, 3857, 4326, -1);

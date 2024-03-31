/** Schema for the Mapboard project management database */

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  uuid UUID NOT NULL DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  database TEXT NOT NULL,
  data_schema TEXT NOT NULL DEFAULT 'mapboard',
  topo_schema TEXT NOT NULL DEFAULT 'map_topology',
  owner_id INTEGER REFERENCES users(id),
  srid INTEGER NOT NULL REFERENCES spatial_ref_sys(srid) DEFAULT 4326,
  tolerance numeric NOT NULL DEFAULT 0.00001
);
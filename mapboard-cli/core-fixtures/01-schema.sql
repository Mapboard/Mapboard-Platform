/** Schema for the Mapboard project management database */

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE projects (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  database TEXT NOT NULL,
  owner_id INTEGER REFERENCES users(id),
  srid INTEGER NOT NULL REFERENCES spatial_ref_sys(srid) DEFAULT 4326
);
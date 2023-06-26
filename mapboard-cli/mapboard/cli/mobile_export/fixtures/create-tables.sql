CREATE TABLE linework (
  id SERIAL PRIMARY KEY,
  geometry geometry(MultiLineString,32733) NOT NULL,
  arbitrary boolean,
  type text NOT NULL DEFAULT '''arbitrary'''::text REFERENCES map_digitizer.linework_type(id) ON UPDATE CASCADE,
  certainty integer,
  map_width numeric,
  pixel_width numeric,
  created timestamp without time zone DEFAULT now()
);
SELECT CreateSpatialIndex('linework','geometry');

CREATE TABLE polygon (
  id integer DEFAULT nextval('map_digitizer.polygon_id_seq'::regclass) PRIMARY KEY,
  geometry geometry(MultiPolygon,32733) NOT NULL,
  type text REFERENCES mapping.unit(id) ON UPDATE CASCADE,
  arbitrary boolean,
  certainty integer,
  map_width double precision,
  pixel_width double precision,
  created timestamp without time zone DEFAULT now()
);
SELECT CreateSpatialIndex('polygon','geometry');

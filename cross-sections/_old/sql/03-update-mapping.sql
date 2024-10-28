INSERT INTO cross_section.linework_type (id, name, color, topology)
SELECT id, name, color, topology FROM map_digitizer.linework_type
WHERE topology = 'bedrock'
ON CONFLICT DO NOTHING;

INSERT INTO cross_section.linework_type (id, name, color, topology)
VALUES ('terrain', 'Terrain', '#888888', 'bedrock')
ON CONFLICT DO NOTHING;

-- Terrain lines
DELETE FROM cross_section.linework WHERE type = 'terrain';

INSERT INTO cross_section.linework (geometry, type, hidden, source)
SELECT ST_Multi(ST_SetSRID(vertical_geom, 3857)), 'terrain', true, 'terrain'
FROM cross_section.section;

DELETE FROM cross_section.polygon WHERE source = 'terrain-intersection';

INSERT INTO cross_section.polygon (geometry, type, hidden, source)
SELECT ST_Multi(ST_SetSRID(geom, 3857)), unit_id, true, 'terrain-intersection'
FROM cross_section.unit_outcrop;
-- Find intersection points of sections
SET search_path TO cross_section, mapping, public;

DO $$
DECLARE
  _ctx_id integer;
	_layer_id integer;
BEGIN

SELECT id FROM map_layer WHERE name = 'Context' INTO _ctx_id;

INSERT INTO linework_type (id, name, color)
VALUES ('cross-section', 'Cross-section', '#000000')
ON CONFLICT DO NOTHING;

/** Create empty layer for outcrop polygons */
INSERT INTO map_layer (name, topological, parent)
VALUES ('Piercing points', true, _ctx_id)
ON CONFLICT (name) DO UPDATE SET
  topological = false,
  parent = _ctx_id
RETURNING id INTO _layer_id;

INSERT INTO map_layer_linework_type (type, map_layer)
SELECT 'cross-section', _layer_id
ON CONFLICT DO NOTHING;

-- delete all piercing point information
DELETE FROM linework WHERE map_layer = _layer_id;
DELETE FROM polygon WHERE map_layer = _layer_id;
DELETE FROM polygon WHERE source = 'Piercing point units';

END $$;

WITH piercing_points AS (
SELECT
	s1.id,
	s2.id other_id,
	s1.vertical_offset,
	s2.vertical_offset other_offset,
	ST_Intersection(s1.geometry, s2.geometry) geometry,
	ST_Length(s1.geometry) * ST_LineLocatePoint(s1.geometry, ST_Intersection(s1.geometry, s2.geometry)) distance
FROM cross_section.section s1
JOIN cross_section.section s2
  ON ST_Intersects(s1.geometry, s2.geometry)
 AND s1.id != s2.id
),
with_geometry AS (
	SELECT
		*,
		ST_SetSRID(ST_MakeLine(
			ST_MakePoint(distance, (vertical_offset-10000+4000)*vertical_exaggeration()),
			ST_MakePoint(distance, (vertical_offset+3000)*vertical_exaggeration())
		), 3857) vertical_geometry
	FROM piercing_points
),
-- Polygons showing the heights of each inferred cross-section unit in the other section
units AS (
	SELECT
		s.id,
		other.id other_id,
		f.unit_id,
		/** Get the geometry of the bedrock units in the other section, and
		translate them to their overlapping position in the current section. */
		ST_Translate(
			ST_Buffer(
				ST_Intersection(f.geometry, other.vertical_geometry),
				20,
				'endcap=flat'
			),
			s.distance-other.distance,
			(s.vertical_offset-other.vertical_offset)*vertical_exaggeration()
		) geometry,
	    coalesce(f.source_layer, f.map_layer) map_layer
	FROM with_geometry s
	JOIN with_geometry other
		ON s.other_id = other.id
	 AND s.id = other.other_id
	JOIN cross_section_topology.map_face f
	  ON ST_Intersects(f.geometry, other.vertical_geometry)
	WHERE f.unit_id IS NOT NULL
),
piercing_points_insert AS (
	INSERT INTO linework (name, type, map_layer, geometry, source)
	SELECT
		other_id name,
		'cross-section' type,
    (SELECT id FROM cross_section.map_layer WHERE name = 'Piercing points') map_layer,
		vertical_geometry,
		'Piercing points'
	FROM with_geometry
),
-- Insert the unit polygons
unit_insert AS (
	INSERT INTO polygon (name, type, map_layer, geometry, source)
	SELECT
		other_id name,
		unit_id type,
		map_layer,
		geometry,
		'Piercing point units' source
	FROM units
)
SELECT 1;

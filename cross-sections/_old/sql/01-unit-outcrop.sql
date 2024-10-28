DROP TABLE IF EXISTS cross_section.unit_outcrop;
CREATE TABLE cross_section.unit_outcrop AS
WITH sec_unit AS (
SELECT
  s.id,
  unit_id,
  s.geometry,
  ST_StartPoint(s.geometry) AS start,
  ST_EndPoint(s.geometry) AS end_,
  (ST_Dump(ST_Intersection(f.geometry, s.geometry))).geom geom
FROM mapping.map_face f
JOIN cross_section.section s
  ON ST_Intersects(f.geometry, s.geometry)
--WHERE f.topology = 'bedrock'
),
indexed AS (
SELECT
  *,
  ST_Distance(start, geom) AS startpt,
  (ST_Length(geometry)-ST_Distance(end_,geom)) AS endpt
FROM sec_unit
)
SELECT
  row_number() OVER () id,
  i.id section,
  unit_id,
  color,
  ST_Intersection(
    ST_MakeEnvelope(startpt, vertical_offset-5000, endpt, vertical_offset+5000),
    ST_Buffer(vertical_geom, 20)
  ) geom
FROM indexed i
JOIN cross_section.section s
  ON s.id = i.id
JOIN mapping.unit
  ON unit.id = unit_id
ORDER BY i.id, start;

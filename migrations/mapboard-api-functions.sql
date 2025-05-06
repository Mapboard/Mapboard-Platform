/** New test function to get info for a location
 * @param lng Longitude of the location
 * @param lat Latitude of the location
 * @param radius Radius in meters to search for units (default is 1.0)
 * @return JSON object containing the location and units information
 */

CREATE OR REPLACE FUNCTION map_digitizer.get_location_info(
  lng numeric,
  lat numeric,
  radius numeric DEFAULT 0.0
)
  RETURNS jsonb AS
$$
DECLARE
  pt       geometry;
  loc      geometry;
  region   geometry;
  lines    jsonb;
  polygons jsonb;
  units    jsonb;
  faces    jsonb;
  nodes    jsonb;
  edges    jsonb;
  result   jsonb;
BEGIN
  pt := st_setsrid(st_makepoint(lng, lat), 4326);
  loc := st_transform(pt, 32733);

  SELECT
    CASE
      WHEN radius = 0 THEN loc
      ELSE st_transform(st_buffer(pt::geography, radius)::geometry, 32733)
      END
  INTO region;

  WITH
    l0 AS (SELECT
             l.id,
             l.map_layer,
             l.type,
             lt.name,
             lt.color,
             ml.name,
             ml.topological
           FROM
             map_digitizer.linework l
             JOIN map_digitizer.linework_type lt
               ON l.type = lt.id
             JOIN map_digitizer.map_layer ml
               ON l.map_layer = ml.id
           WHERE
             st_intersects(l.geometry, region))
  SELECT
    jsonb_agg(to_jsonb(l0))
  FROM
    l0
  INTO lines;

  WITH
    p0 AS (SELECT
             p.id,
             p.map_layer,
             p.type,
             pt.name,
             pt.color,
             ml.name,
             ml.topological
           FROM
             map_digitizer.polygon p
             JOIN map_digitizer.polygon_type pt
               ON p.type = pt.id
             JOIN map_digitizer.map_layer ml
               ON p.map_layer = ml.id
           WHERE
             st_intersects(p.geometry, region))
  SELECT
    jsonb_agg(to_jsonb(p0))
  FROM
    p0
  INTO polygons;

  WITH
    u0 AS (SELECT
             f.id,
             f.unit_id,
             f.map_layer,
             ml.name,
             pt.name,
             pt.color,
             pt.symbol,
             pt.symbol_color
           FROM
             map_topology.map_face f
             LEFT JOIN map_digitizer.map_layer ml
               ON ml.id = f.map_layer
             LEFT JOIN map_digitizer.polygon_type pt
               ON pt.id = f.unit_id
           WHERE
             st_intersects(f.geometry, region))
  SELECT
    jsonb_agg(to_jsonb(u0))
  FROM
    u0
  INTO units;

  SELECT
    jsonb_agg(face_id)
  FROM
    map_topology.face f
  WHERE
      mbr && region
  AND st_intersects(st_getfacegeometry('map_topology', f.face_id), region)
  INTO faces;

  SELECT
    jsonb_agg(edge_id)
  FROM
    map_topology.edge e
  WHERE
    st_intersects(e.geom, region)
  INTO edges;

  SELECT
    jsonb_agg(node_id)
  FROM
    map_topology.node n
  WHERE
    st_intersects(n.geom, region)
  INTO nodes;

  result := jsonb_build_object(
    'fills', units,
    'lines', lines,
    'polygons', polygons,
    'topology', jsonb_build_object(
      'faces', faces,
      'edges', edges,
      'nodes', nodes));

  RETURN jsonb_strip_nulls(result);
END;
$$ LANGUAGE plpgsql STABLE;

SELECT map_digitizer.get_location_info(16.15, -24.29, 100)::text;

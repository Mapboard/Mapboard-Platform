CREATE OR REPLACE FUNCTION cross_section.drape(
    line geometry,
    spacing numeric = 10,
    vertical_offset integer = 0
  ) RETURNS geometry
AS $$
DECLARE
  geom_vertical geometry;
BEGIN
	WITH distances AS (
		SELECT least(
			generate_series(0, ceil(ST_Length(line)/spacing)::integer)*spacing,
			ST_Length(line)
		) AS distance
	),
	geoms AS (
		SELECT
			ST_LineInterpolatePoint(line, distance/ST_Length(line)) geom,
			distance
		FROM distances
	),
  cells AS (
  -- Get DEM elevation for each intersected cell
  	SELECT
			c.distance,
			coalesce(
				ST_Value(dem1.rast, 1, c.geom, true, 'bilinear'),
				ST_Value(dem2.rast, 1, c.geom, true, 'bilinear')
			) z
		FROM geoms c
		LEFT JOIN raster.spot_dem dem1
		  ON ST_Intersects(dem1.rast, c.geom)
		 AND ST_Intersects(dem1.rast, line)
		LEFT JOIN raster.alos_dem dem2
		  ON ST_Intersects(dem2.rast, c.geom)
		 AND ST_Intersects(dem2.rast, line)
	),
  points AS (
    SELECT ST_MakePoint(
      distance,
      z+vertical_offset
    ) AS geom
    FROM cells
    ORDER BY distance
  )
  -- Build 3D line from 3D points
  SELECT ST_MakeLine(geom) INTO geom_vertical FROM points;
  RETURN geom_vertical;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE cross_section.section
ADD COLUMN vertical_geom geometry(LineString);

ALTER TABLE cross_section.section
ADD COLUMN hash uuid;


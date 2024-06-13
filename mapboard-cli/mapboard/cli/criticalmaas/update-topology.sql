SET search_path TO {data_schema}, {topo_schema},public;

-- Polygon seed function
CREATE OR REPLACE FUNCTION {topo_schema}.build_polygon_seed(polygon geometry)
    RETURNS geometry AS
$$
DECLARE
    circle record;
    radius double precision;
BEGIN
    circle := ST_MaximumInscribedCircle(polygon);
    radius := least(greatest(circle.radius/2, 10), 100);
    RETURN ST_Intersection(ST_Buffer(circle.center, radius), ST_Buffer(polygon, -circle.radius/4));
END;
$$
LANGUAGE plpgsql;

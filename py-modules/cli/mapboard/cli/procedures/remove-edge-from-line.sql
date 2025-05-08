/** Remove an edge from a linework geometry */
WITH NEW AS (
  SELECT
    l.id,
    topology.TopoGeom_remElement(l.topo, ARRAY[:edge_id, 2]::topology.topoelement) topo
  FROM {data_schema}.linework l
  WHERE l.id = :line_id
    AND l.topo IS NOT NULL
)
UPDATE {data_schema}.linework l
SET topo = NEW.topo,
    geometry = NEW.topo::geometry,
    geometry_hash = {topo_schema}.hash_geometry(NEW.topo::geometry)
FROM NEW
WHERE l.id = NEW.id
  AND l.topo IS NOT NULL

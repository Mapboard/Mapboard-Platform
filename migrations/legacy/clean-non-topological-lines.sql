/**
  Clean up lines that are not supposed to be in any topology.
 */

UPDATE {data_schema}.linework l
SET topo = null,
    topology_error = null,
    geometry_hash = null
WHERE {topo_schema}.get_topological_map_layer(l) IS null
  AND topo IS NOT null;

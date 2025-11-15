SELECT
  e.edge_id,
  l.id line_id,
  l.map_layer layer,
  ST_Length(e.geom) length
FROM {topo_schema}.edge_data e
JOIN {topo_schema}.node_multiplicity snm
  ON e.start_node = snm.node_id
JOIN {topo_schema}.node_multiplicity enm
  ON e.end_node = enm.node_id
JOIN {topo_schema}.__edge_relation er
  ON e.edge_id = er.edge_id
JOIN {data_schema}.linework l
  ON l.id = er.line_id
 AND l.map_layer = er.map_layer
JOIN {data_schema}.map_layer ml
  ON ml.id = l.map_layer
WHERE (snm.n_edges = 1 OR enm.n_edges = 1)
 AND ml.composited_from IS NULL
 AND {filters}


ALTER TABLE {data_schema}.linework DROP COLUMN topo;
ALTER TABLE {data_schema}.linework DROP COLUMN geometry_hash;
ALTER TABLE {data_schema}.linework DROP COLUMN topology_error;

DROP SCHEMA IF EXISTS {topo_schema} CASCADE;

-- TODO: delete topology columns from mapboard tables


DELETE FROM topology.layer l
WHERE l.topology_id = (
  SELECT t.id
  FROM topology.topology t
  WHERE t.name = :topo_name
);

DELETE FROM topology.topology t
WHERE t.name = :topo_name;
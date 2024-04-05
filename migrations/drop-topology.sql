DROP SCHEMA IF EXISTS map_topology CASCADE;

-- TODO: delete topology columns from mapboard tables

DELETE FROM topology.layer l
WHERE l.topology_id = (
  SELECT t.id
  FROM topology.topology t
  WHERE t.name = 'map_topology'
);

DELETE FROM topology.topology t
WHERE t.name = 'map_topology';
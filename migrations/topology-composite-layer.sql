
-- Composite layer
-- Contains only generated points and lines

-- 1. Join all layers in surficial topology
-- 2. Check whether the matching face is null

-- if null, then Join all layers in Cenozoic topology, bounded by surficial as well

-- 2. check whether cenozoic topology is null


-----------

-- For all dirty faces, find layers where topogeometry containing that face is present
-- Sort by

/*

Topogeometries in topmost layer get added "as is"
For next layer, for each topogeometry get faces that are not in higher levels of topogeometry

- New system-managed layer for composite/overlayed layers
 */

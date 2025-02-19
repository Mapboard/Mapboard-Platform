UPDATE cross_section.section SET
  -- Vertical offset set to 0 (for now)
  vertical_geom = cross_section.drape(geometry, 5, vertical_offset),
  hash = md5(ST_AsBinary(geometry))::uuid
WHERE hash != md5(ST_AsBinary(geometry))::uuid
   OR hash IS null
   OR vertical_geom IS null;

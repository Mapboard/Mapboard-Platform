-- Adjust vertical exaggeration for each section that needs it
DO $$
DECLARE
  current numeric;
  ratio numeric;
BEGIN
  SELECT exaggeration INTO current FROM cross_section.meta;

  IF current = cross_section.vertical_exaggeration() THEN
    RETURN;
  END IF;

  ratio := cross_section.vertical_exaggeration() / current;

  UPDATE polygon SET
    geometry = ST_Scale(geometry, 1, ratio)
  WHERE ST_IsEmpty(geometry) = false;

  UPDATE linework SET
    geometry = ST_Scale(geometry, 1, ratio)
  WHERE ST_IsEmpty(geometry) = false;

  UPDATE cross_section.meta SET
    exaggeration = cross_section.vertical_exaggeration();
END $$;

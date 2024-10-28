DROP TABLE IF EXISTS cross_section.polygon_type CASCADE;
CREATE OR REPLACE VIEW cross_section.polygon_type AS
SELECT
  id,
  name,
  color,
  topology,
  fgdc_symbol symbol,
  symbol_color
FROM mapping.unit;

-- Add unit_id foreign key
ALTER TABLE cross_section.polygon
ADD CONSTRAINT polygon_type_fk
FOREIGN KEY (type) REFERENCES mapping.unit(id);

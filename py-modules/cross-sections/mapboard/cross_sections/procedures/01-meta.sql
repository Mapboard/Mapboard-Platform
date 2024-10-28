/** For now we set the desired vertical exaggeration in this function. */
CREATE OR REPLACE FUNCTION cross_section.vertical_exaggeration()
  RETURNS numeric AS
$$
SELECT 1;
$$ LANGUAGE SQL;

CREATE TABLE IF NOT EXISTS cross_section.meta
(
  exaggeration numeric NOT NULL DEFAULT 1,
  spacing      numeric NOT NULL DEFAULT 10000
);

INSERT INTO cross_section.meta (exaggeration, spacing)
SELECT 1, 10000
WHERE NOT EXISTS (SELECT 1 FROM cross_section.meta);

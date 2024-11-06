/** Function to return the project ID for a given slug */
CREATE OR REPLACE FUNCTION mapboard.project_id(project_slug text)
  RETURNS integer AS
$$
SELECT id FROM mapboard.project WHERE slug = project_slug;
$$ LANGUAGE sql;

/*
 Copy metadata for a mapboard.project to a new project, including its canvases and contexts,
 preserving key relationships.

 This does not update the location of the data itself (that must be done in a separate step).
 */

CREATE OR REPLACE FUNCTION mapboard.copy_project_metadata(
  source_project integer
) RETURNS integer AS $$
DECLARE
  new_project_id integer;
  canvas_record RECORD;
  context_record RECORD;
  new_canvas_id integer;
  new_context_id integer;
  canvas_id_map   JSONB;
  context_id_map  JSONB;
BEGIN
  -- Copy the project metadata
  INSERT INTO mapboard.project (slug, title, description, owner_id, srid, derived_from, main_context)
  SELECT
    slug || '-copy',
    title || ' (Copy)',
    description,
    owner_id,
    srid,
    source_project,
    main_context
  FROM mapboard.project p
  WHERE p.id = source_project
  RETURNING id INTO new_project_id;

  /** These mappings allow us to associate old IDs with new IDs, so that we can
    update canvas/context relationships.
   */
  canvas_id_map := jsonb_build_object();
  context_id_map := jsonb_build_object();

  -- Copy canvases
  FOR canvas_record IN
    SELECT * FROM mapboard.canvas WHERE project_id = source_project
  LOOP
    INSERT INTO mapboard.canvas (project_id, type, database, data_schema, topo_schema, srid, tolerance, legacy)
    VALUES (new_project_id, canvas_record.type, canvas_record.database, canvas_record.data_schema, canvas_record.topo_schema, canvas_record.srid, canvas_record.tolerance, canvas_record.legacy)
    RETURNING id INTO new_canvas_id;
    -- Insert IDs into the Canvas ID map
    canvas_id_map := canvas_id_map || jsonb_build_object(canvas_record.id::text, new_canvas_id);
  END LOOP;

  -- Copy contexts
  FOR context_record IN
    SELECT * FROM mapboard.context WHERE project_id = source_project
  LOOP
    INSERT INTO mapboard.context (project_id, canvas_id, name, description, slug, bounds, is_public, parent, parent_geom, offset_x, offset_y)
    VALUES (new_project_id,
            (canvas_id_map ->> context_record.canvas_id::text)::integer,
            context_record.name,
            context_record.description,
            context_record.slug,
            context_record.bounds,
            context_record.is_public,
            context_record.parent,
            context_record.parent_geom,
            context_record.offset_x,
            context_record.offset_y)
    RETURNING id INTO new_context_id;
    context_id_map := context_id_map || jsonb_build_object(context_record.id::text, new_context_id);
  END LOOP;

  -- Update main_context in the new project if it exists
  UPDATE mapboard.project
  SET main_context = (context_id_map ->> main_context::text)::integer
  WHERE id = new_project_id
  AND main_context IS NOT NULL;

  -- Update parent-child context relationships as needed
  UPDATE mapboard.context
  SET parent = (context_id_map ->> parent::text)::integer
  WHERE project_id = new_project_id
  AND parent IS NOT NULL;

  RETURN new_project_id;
END;
$$
LANGUAGE plpgsql;

/**
  Delete a project and all associated canvases and contexts.
 */
CREATE OR REPLACE FUNCTION mapboard.delete_project_metadata(
  target_project integer
) RETURNS void AS $$
BEGIN
  UPDATE mapboard.project SET main_context = NULL WHERE id = target_project;
  DELETE FROM mapboard.context WHERE project_id = target_project;
  DELETE FROM mapboard.canvas WHERE project_id = target_project;
  DELETE FROM mapboard.project WHERE id = target_project;
END;
$$
LANGUAGE plpgsql;

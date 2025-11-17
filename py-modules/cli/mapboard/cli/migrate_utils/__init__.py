"""
Utilities to migrate the Mapboard database to a single multi-tenant setup
(with multiple data schemas).
"""

from .backup_cluster import pg_dump_cluster
from macrostrat.database import Database
import uuid

import re


def copy_schema_data(db, source, target, exclude_tables=None, truncate=False):
    """Copy one schema to another within the same database."""

    if exclude_tables is None:
        exclude_tables = []

    # Get list of tables in source schema
    tables = (
        db.run_query(
            """
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = :source_schema
        """,
            dict(source_schema=source),
        )
        .scalars()
        .all()
    )

    for table in tables:
        if table in exclude_tables:
            continue

        sql = f"""
        INSERT INTO {target}.{table} (SELECT * FROM {source}.{table});
        """
        db.run_sql(sql)


def migrate_projects(db: Database):
    """
    Major data migration:
    Migrate all projects from the original multi-database setup to a multi-schema design.
    """

    # Get a list of project to migrate. These are legacy projects that don't have a modern project
    # derived from them.

    sql = """
    SELECT p.id, p.slug
    FROM mapboard.project p
    LEFT JOIN mapboard.project p2 ON p2.derived_from = p.id
    WHERE p2.id IS NULL AND p.derived_from IS NULL;
    """

    projects = db.run_query(sql).all()

    print(f"Found {len(projects)} projects to migrate.")

    for project in projects:
        print(f"Migrating project {project.id} ({project.slug})...")
        migrate_project(db, project)


def migrate_project(db: Database, project):
    """Migrate a single project to the new schema design."""

    new_project_id = db.run_query(
        """
    INSERT INTO mapboard.project (slug, title, description, derived_from)
    SELECT slug || '-updated', title, description, id
    FROM mapboard.project
    WHERE id = :project_id
    ON CONFLICT (slug) DO NOTHING
    RETURNING id;
    """,
        dict(project_id=project.id),
    ).scalar_one()

    # Get contexts to migrate
    canvases = db.run_query(
        """
        SELECT id, type::text type, data_schema, topo_schema, tolerance, srid
        FROM mapboard.canvas
        WHERE project_id = :project_id;
        """,
        dict(project_id=project.id),
    ).all()

    for context in canvases:
        migrate_context(db, project, context)


def migrate_context(db: Database, project, context):
    """Migrate a single context to the new schema design."""
    print(f"  Context {context.id} ({context.type})...")

    # Create a new random UUID
    context.uuid = uuid.uuid4()

    data_schema = target_schema_name(project, context, type="data")
    print(f"  Target schema (data): {data_schema}")

    topo_schema = target_schema_name(project, context, type="topo")
    print(f"  Target schema (topo): {topo_schema}")

    params = {
        "data_schema": data_schema,
        "topo_schema": topo_schema,
        "tolerance": context.tolerance,
        "srid": context.srid,
        "uuid": str(context.uuid),
    }

    # Insert the record into the canvas table
    new_context_id = db.run_query(
        """
    INSERT INTO mapboard.canvas (
        project_id,
        type,
        database,
        data_schema,
        topo_schema,
        tolerance,
        srid,
        uuid
    )
    VALUES (
           :project_id,
           :type,
           'mapboard',
           :data_schema,
           :topo_schema,
           :tolerance,
           :srid,
           :uuid
    )
    RETURNING id;
    """,
        dict(project_id=project.id, type=context.type, **params),
    ).scalar_one()


def target_schema_name(project, context, type="data"):
    uid = str(context.uuid)[0:8]
    v0 = f"{uid}_{project.slug}_{context.type}_{type}"
    return simplify_slug(v0)


def simplify_slug(slug: str, spacer="_") -> str:
    """Simplify a project slug to be used in schema names."""
    # Lowercase, replace non-alphanumeric with underscores
    simplified = re.sub(r"[^a-z0-9]+", spacer, slug.lower())
    return simplified.strip("_")

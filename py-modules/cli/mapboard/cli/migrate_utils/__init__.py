"""
Utilities to migrate the Mapboard database to a single multi-tenant setup
(with multiple data schemas).
"""

from .backup_cluster import pg_dump_cluster
from macrostrat.database import Database
from psycopg2.sql import Identifier

from .foreign_schema import foreign_server_connection, map_foreign_schema

import re
from mapboard.core.settings import connection_string


def copy_schema_data(db, source, target, *, exclude_tables=None, truncate=False):
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

        source_table = Identifier(source, table)
        target_table = Identifier(target, table)

        if truncate:
            sql = f"TRUNCATE TABLE {target} CASCADE;"
            db.run_sql(
                sql,
                dict(
                    target=target_table,
                ),
            )

        sql = f"""
        INSERT INTO {target} SELECT * FROM {source};
        """
        db.run_sql(
            sql,
            dict(
                source=source_table,
                target=target_table,
            ),
        )


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
        "SELECT mapboard.copy_project_metadata(:project_id)",
        dict(project_id=project.id),
    ).scalar_one()

    # Get contexts to migrate
    canvases = db.run_query(
        """
        SELECT id, type::text type, data_schema, topo_schema, database, tolerance, srid, uuid
        FROM mapboard.canvas
        WHERE project_id = :project_id;
        """,
        dict(project_id=new_project_id),
    ).all()

    for context in canvases:
        migrate_canvas(db, project, context)


def migrate_canvas(db: Database, project, context):
    """Migrate a single context to the new schema design."""
    print(f"  Context {context.id} ({context.type})...")

    data_schema = target_schema_name(project, context, type="data")
    print(f"  Target schema (data): {data_schema}")

    topo_schema = target_schema_name(project, context, type="topo")
    print(f"  Target schema (topo): {topo_schema}")

    if (
        context.data_schema == data_schema
        and context.topo_schema == topo_schema
        and not context.legacy
    ):
        print("  Context already migrated, skipping.")
        return

    params = {
        "data_schema": data_schema,
        "topo_schema": topo_schema,
        "tolerance": context.tolerance,
        "srid": context.srid,
    }

    ctx_params = {
        "project_id": project.id,
        "context_id": context.id,
        **params,
    }

    # Create new schemas
    from mapboard.topology_manager.database import Database as TopoDatabase
    from mapboard.cli.fixtures import apply_fixtures

    topo_db = TopoDatabase(db.engine.url)
    topo_db.set_params(env={}, **params)

    apply_fixtures(topo_db)

    # Copy data from old schema
    old_db_url = connection_string(context.database)
    old_data_schema = context.data_schema

    if context.database != "mapboard":
        temp_schema = target_schema_name(project, context, type="temp_data")
        with foreign_server_connection(db, old_db_url) as foreign_server:
            map_foreign_schema(
                db, foreign_server, temp_schema, foreign_schema=old_data_schema
            )
            copy_schema_data(
                db,
                source=temp_schema,
                target=data_schema,
                truncate=True,
            )
    else:
        copy_schema_data(
            db,
            source=old_data_schema,
            target=data_schema,
            truncate=True,
        )

    # Reset topo geometry in preparation for redoing topology
    db.run_sql(
        """
        UPDATE {table}
        SET
            topo = null,
            geometry_hash = null
            topology_error = null
        """,
        dict(table=Identifier(data_schema, "linework")),
        raise_on_error=True,
    )

    # Finish migration by updating the database record
    sql = """
    UPDATE mapboard.canvas SET
        database = 'mapboard',
        data_schema = :data_schema,
        topo_schema = :topo_schema,
        tolerance = :tolerance,
        legacy = FALSE,
        srid = :srid
    WHERE id = :context_id
      AND project_id = :project_id
    """
    db.run_sql(sql, ctx_params)


def target_schema_name(project, context, type="data") -> str:
    """Generate a target schema name for a project canvas."""
    uid = str(context.uuid)[0:8]
    v0 = f"{uid}_{project.slug}_{context.type}_{type}"
    return simplify_slug(v0)


def simplify_slug(slug: str, spacer="_") -> str:
    """Simplify a project slug to be used in schema names."""
    # Lowercase, replace non-alphanumeric with underscores
    simplified = re.sub(r"[^a-z0-9]+", spacer, slug.lower())
    return simplified.strip("_")

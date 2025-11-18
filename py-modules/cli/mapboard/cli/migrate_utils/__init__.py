"""
Utilities to migrate the Mapboard database to a single multi-tenant setup
(with multiple data schemas).
"""

from .backup_cluster import pg_dump_cluster
from macrostrat.database import Database
from psycopg2.sql import Identifier

from .foreign_schema import (
    foreign_server_connection,
    map_foreign_schema,
    create_foreign_server,
)

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

    # In case this is a foreign schema, augment the list with foreign tables
    foreign_tables = (
        db.run_query(
            """
        SELECT foreign_table_name
        FROM information_schema.foreign_tables
        WHERE foreign_table_schema = :source_schema
        """,
            dict(source_schema=source),
        )
        .scalars()
        .all()
    )

    tables += foreign_tables

    for table in tables:
        if table in exclude_tables:
            continue
        is_foreign_table = table in foreign_tables

        suffix = ""
        if is_foreign_table:
            suffix = "(foreign table)"

        print("Copying data for table", table, suffix)

        source_table = Identifier(source, table)
        target_table = Identifier(target, table)

        if truncate:
            db.run_sql(
                "TRUNCATE TABLE {target} CASCADE",
                dict(
                    target=target_table,
                ),
                raise_on_error=True,
            )

        db.run_sql(
            "INSERT INTO {target} SELECT * FROM {source}",
            dict(
                source=source_table,
                target=target_table,
            ),
            raise_on_error=True,
        )


def migrate_projects(db: Database):
    """
    Major data migration:
    Migrate all projects from the original multi-database setup to a multi-schema design.
    """

    # Get a list of project to migrate. These are legacy projects that don't have a modern project
    # derived from them.

    sql = """
    SELECT p.id, p.slug, p.uuid
    FROM mapboard.project p
    LEFT JOIN mapboard.project p2 ON p2.derived_from = p.id
    WHERE p2.id IS NULL AND p.derived_from IS NULL;
    """

    projects = db.run_query(sql).all()

    print(f"Found {len(projects)} projects to migrate.")

    for project in projects:
        print(f"Migrating project {project.id} ({project.slug})...")
        migrate_project(db, project)


def delete_migrated_projects(db: Database):
    """Delete all projects that were created as part of the migration process."""

    # Get a list of projects to delete
    projects = db.run_query(
        "SELECT id, slug, uuid FROM mapboard.project WHERE derived_from IS NOT NULL;"
    ).all()

    for project in projects:
        print(f"Deleting project {project.id}...")
        # Get a list of contexts associated with the project
        canvases = _get_canvases(db, project.id)
        for context in canvases:
            types = ["data", "topo", "temp_data"]
            for t in types:
                schema_name = target_schema_name(project, context, type=t)
                db.run_sql(
                    f"DROP SCHEMA IF EXISTS {schema_name} CASCADE;",
                    raise_on_error=True,
                )

            topo_name = target_schema_name(project, context, type="topo")

            # Drop the topology that may be associated with the project
            db.run_sql(
                "SELECT topology.DropTopology(name) FROM topology.topology WHERE name = :topo_name",
                dict(topo_name=topo_name),
            )

        # Finally, delete the project metadata
        db.run_sql(
            "SELECT mapboard.delete_project_metadata(:project_id);",
            dict(project_id=project.id),
        )


def _get_canvases(db, project_id):
    """Get canvases associated with a project."""
    return db.run_query(
        """
        SELECT id, type::text type, data_schema, topo_schema, database, tolerance, srid, uuid
        FROM mapboard.canvas
        WHERE project_id = :project_id;
        """,
        dict(project_id=project_id),
    ).all()


def migrate_project(db: Database, project):
    """Migrate a single project to the new schema design."""

    new_project_id = db.run_query(
        "SELECT mapboard.copy_project_metadata(:project_id)",
        dict(project_id=project.id),
    ).scalar_one()
    db.session.commit()

    # Get project record
    new_project = db.run_query(
        "SELECT id, slug, uuid FROM mapboard.project WHERE id = :project_id",
        dict(project_id=new_project_id),
    ).one()

    # Get contexts to migrate
    for context in _get_canvases(db, new_project_id):
        migrate_canvas(db, new_project, context)


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
    old_db = Database(old_db_url)

    src_schema = old_data_schema
    if context.database != "mapboard":
        temp_schema = target_schema_name(project, context, type="temp_data")
        foreign_server = create_foreign_server(db, old_db)
        map_foreign_schema(
            db, foreign_server, temp_schema, foreign_schema=old_data_schema
        )
        src_schema = temp_schema

    copy_schema_data(
        db,
        source=src_schema,
        target=data_schema,
        truncate=True,
    )

    # Reset topo geometry in preparation for redoing topology
    db.run_sql(
        """
        UPDATE {table}
        SET
            topo = null,
            geometry_hash = null,
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
    uid = str(project.uuid)[0:8]
    slug_base = project.slug
    # We already have unique IDs, so remove any -copy suffixes
    if slug_base.endswith("-copy"):
        slug_base = slug_base[: -len("-copy")]

    v0 = f"z_{uid}_{slug_base}_{context.type}_{type}"
    return simplify_slug(v0)


def simplify_slug(slug: str, spacer="_") -> str:
    """Simplify a project slug to be used in schema names."""
    # Lowercase, replace non-alphanumeric with underscores
    simplified = re.sub(r"[^a-z0-9]+", spacer, slug.lower())
    return simplified.strip("_")


def drop_unreferenced_topologies(db: Database):
    """Drop topologies that are not referenced by any context."""

    sql = """
    WITH unreferenced_topologies AS (
        SELECT id, name
        FROM topology.topology
        WHERE name NOT IN (
            SELECT topo_schema
            FROM mapboard.canvas
            WHERE database = 'mapboard'
        )
    )
    SELECT topology.DropTopology(name)
    FROM unreferenced_topologies;
    """
    res = db.run_query(sql).scalars().all()
    db.session.commit()
    for val in res:
        print(val)

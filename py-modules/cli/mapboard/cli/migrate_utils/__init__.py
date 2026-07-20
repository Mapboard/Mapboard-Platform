"""
Utilities to migrate the Mapboard database to a single multi-tenant setup
(with multiple data schemas).
"""

import asyncio

from .backup_cluster import pg_dump_cluster
from macrostrat.database import Database
from macrostrat.database.transfer.move_tables import move_tables
from psycopg2.sql import Identifier, SQL

from .foreign_schema import (
    foreign_server_connection,
    map_foreign_schema,
    create_foreign_server,
    drop_foreign_server,
)

import re
from mapboard.core.settings import connection_string, POSTGRES_IMAGE


def _schema_tables(db, schema) -> list[str]:
    """All base + foreign table names in a schema (foreign tables back FDW imports)."""
    base = (
        db.run_query(
            "SELECT tablename FROM pg_tables WHERE schemaname = :schema",
            dict(schema=schema),
        )
        .scalars()
        .all()
    )
    foreign = (
        db.run_query(
            """
            SELECT foreign_table_name
            FROM information_schema.foreign_tables
            WHERE foreign_table_schema = :schema
            """,
            dict(schema=schema),
        )
        .scalars()
        .all()
    )
    return list(base) + list(foreign)


def _table_columns(db, schema, table) -> list[str]:
    """Column names for a table, in definition order (works for foreign tables too)."""
    return (
        db.run_query(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = :schema AND table_name = :table
            ORDER BY ordinal_position
            """,
            dict(schema=schema, table=table),
        )
        .scalars()
        .all()
    )


# --- Project-scoped (auxiliary) schema discovery, naming & migration ---------

# Schemas that are never project data: PostgreSQL/PostGIS system schemas, extension
# and tooling schemas, the core Mapboard schemas (leftovers in the legacy per-project
# databases), and regenerable/derived data. PostGIS topologies (``*_topology``) are
# rebuilt separately; large rasters are excluded by decision.
SYSTEM_SCHEMAS = {
    "public",
    "information_schema",
    "topology",
    "mapboard",
    "mapboard_api",
    "tiger",
    "tiger_data",
    "tile_utils",
    "tiles",
    "ossp-uuid",
    "qgis_projects",
    "raster",
    "contour",
}

# Non-project objects in a legacy database's `public` schema: the PostGIS catalog,
# and imported OpenStreetMap basemap (regenerable, excluded by decision).
PUBLIC_SYSTEM_TABLES = {
    "spatial_ref_sys",
    "geometry_columns",
    "geography_columns",
    "raster_columns",
    "raster_overviews",
    "layer",
    "topology",
}


def _is_system_schema(name: str) -> bool:
    """True if a schema holds system/tooling/derived data rather than project data."""
    if name in SYSTEM_SCHEMAS:
        return True
    if name.endswith("_topology"):  # PostGIS topologies — rebuilt separately
        return True
    if name.endswith("_bak"):  # legacy backups — skipped by decision
        return True
    if name.startswith(("mb_", "z_")):  # already-migrated multi-tenant schemas
        return True
    return False


def auxiliary_schemas(db: Database, *, canvas_schemas=()) -> list[str]:
    """Non-system, non-canvas schemas that hold project data in a legacy database.

    Only schemas containing at least one ordinary table are returned (empty leftover
    schemas are ignored).
    """
    exclude = set(canvas_schemas)
    rows = (
        db.run_query(
            r"""
            SELECT n.nspname
            FROM pg_namespace n
            WHERE n.nspname NOT LIKE 'pg\_%'
              AND EXISTS (
                SELECT 1 FROM pg_class c
                WHERE c.relnamespace = n.oid AND c.relkind IN ('r', 'p')
              )
            """
        )
        .scalars()
        .all()
    )
    return sorted(s for s in rows if not _is_system_schema(s) and s not in exclude)


def public_project_tables(db: Database) -> list[str]:
    """Project-data tables in a legacy database's `public` schema.

    Excludes the PostGIS catalog, imported OSM basemap (``planet_osm_*``), legacy
    backups (``*_bak``), and internal helper tables (``__*``).
    """
    rows = (
        db.run_query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
        .scalars()
        .all()
    )
    keep = []
    for t in rows:
        if t in PUBLIC_SYSTEM_TABLES:
            continue
        if t.startswith("planet_osm"):
            continue
        if t.endswith("_bak"):
            continue
        if t.startswith("__"):
            continue
        keep.append(t)
    return sorted(keep)


def project_schema_name(project, source_name: str) -> str:
    """Namespaced name for a project-scoped (auxiliary or base) schema.

    Layout: ``mb_<slug>_<source>_<project-uuid8>`` — grouped alongside the project's
    canvas schemas under the ``mb_<slug>_`` prefix. Auxiliary schemas are project-
    (not canvas-) scoped, so identity is the *project* UUID.
    """
    uid = str(project.uuid)[0:8]

    slug_base = project.slug
    if slug_base.endswith("-copy"):
        slug_base = slug_base[: -len("-copy")]
    slug_hint = simplify_slug(slug_base)[:20].strip("_")

    src = simplify_slug(source_name)[:24].strip("_")

    name = f"mb_{slug_hint}_{src}_{uid}"
    if len(name) > 63:
        keep = len(slug_hint) - (len(name) - 63)
        slug_hint = slug_hint[: max(0, keep)].strip("_")
        name = f"mb_{slug_hint}_{src}_{uid}"
    return name


def _register_project_schema(
    db, project_id, schema_name, source_name, kind, *, canvas_id=None
):
    """Record a project-owned schema in mapboard.project_schema (idempotent)."""
    db.run_sql(
        """
        INSERT INTO mapboard.project_schema
            (project_id, canvas_id, schema_name, source_name, kind)
        VALUES (:project_id, :canvas_id, :schema_name, :source_name, :kind)
        ON CONFLICT (schema_name) DO UPDATE SET
            project_id  = excluded.project_id,
            canvas_id   = excluded.canvas_id,
            source_name = excluded.source_name,
            kind        = excluded.kind
        """,
        dict(
            project_id=project_id,
            canvas_id=canvas_id,
            schema_name=schema_name,
            source_name=source_name,
            kind=kind,
        ),
    )


def migrate_auxiliary_schemas(
    db: Database, project, source_database: str, *, canvas_schemas=()
):
    """Clone a project's non-canvas schemas + public project tables from its legacy
    database into the merged database, namespaced under the project.

    Structure, data, and (intra-project) cross-schema foreign keys are preserved by a
    single scoped ``pg_dump | pg_restore``. pg_restore lands objects under their
    original names, so we immediately rename each schema into its ``mb_<slug>_…`` name
    (foreign keys are OID-based and follow the rename) and collect the project's
    ``public`` data into a single base schema. Everything is recorded in
    mapboard.project_schema.
    """
    source_db = Database(connection_string(source_database))

    aux = auxiliary_schemas(source_db, canvas_schemas=canvas_schemas)
    pub_tables = public_project_tables(source_db)

    if not aux and not pub_tables:
        print(f"  No auxiliary data to migrate from {source_database}.")
        return

    print(f"  Auxiliary schemas from {source_database}: {', '.join(aux) or '(none)'}")
    print(f"  Public project tables: {', '.join(pub_tables) or '(none)'}")

    # Move structure + data in one dump so cross-schema FKs restore intact.
    task = move_tables(
        source_db.engine,
        db.engine,
        schemas=list(aux),
        tables=[f"public.{t}" for t in pub_tables],
        restore_args=["--no-owner"],
        postgres_container=POSTGRES_IMAGE,
    )
    asyncio.run(task)

    # Rename each auxiliary schema into its namespaced name and register it.
    for source_name in aux:
        target = project_schema_name(project, source_name)
        db.run_sql(
            "ALTER SCHEMA {old} RENAME TO {new}",
            dict(old=Identifier(source_name), new=Identifier(target)),
            raise_on_error=True,
        )
        db.run_sql(
            "COMMENT ON SCHEMA {schema} IS :label",
            dict(schema=Identifier(target), label=f"{project.slug} — {source_name}"),
        )
        _register_project_schema(db, project.id, target, source_name, "auxiliary")
        print(f"    {source_name} -> {target}")

    # Collect the project's public data into a single base schema.
    if pub_tables:
        base = project_schema_name(project, "base")
        db.run_sql(
            "CREATE SCHEMA IF NOT EXISTS {schema}",
            dict(schema=Identifier(base)),
            raise_on_error=True,
        )
        for t in pub_tables:
            db.run_sql(
                "ALTER TABLE public.{table} SET SCHEMA {schema}",
                dict(table=Identifier(t), schema=Identifier(base)),
                raise_on_error=True,
            )
        db.run_sql(
            "COMMENT ON SCHEMA {schema} IS :label",
            dict(schema=Identifier(base), label=f"{project.slug} — base (from public)"),
        )
        _register_project_schema(db, project.id, base, "public", "base")
        print(f"    public project tables -> {base}")

    db.session.commit()


def copy_schema_data(db, source, target, *, exclude_tables=None, truncate=True):
    """Copy every table from one schema to another within the same database.

    Only tables present in *both* schemas are copied, matched by explicit column
    name (never ``SELECT *``): the source and target ``linework``/``polygon`` tables
    carry the same columns in *different* order, so a positional copy silently maps
    e.g. ``created`` (timestamp) onto ``map_layer`` (integer) and aborts the load.
    Matching by name also tolerates schema drift (columns only on one side are ignored;
    target-only columns keep their defaults).

    Triggers and referential-integrity checks are disabled on the target tables for
    the duration of the load, so table order is irrelevant and topology triggers do
    not fire on the bulk insert (topology is rebuilt separately afterwards).
    """
    if exclude_tables is None:
        exclude_tables = []

    source_tables = set(_schema_tables(db, source))
    target_tables = set(_schema_tables(db, target))
    tables = sorted((source_tables & target_tables) - set(exclude_tables))

    missing = sorted(source_tables - target_tables - set(exclude_tables))
    if missing:
        print(f"  ! source tables with no target, skipped: {', '.join(missing)}")

    # Disable triggers + RI on the target so insertion order and FK ordering do not matter.
    for table in tables:
        db.run_sql(
            "ALTER TABLE {table} DISABLE TRIGGER ALL",
            dict(table=Identifier(target, table)),
            raise_on_error=True,
        )
    try:
        if truncate:
            for table in tables:
                db.run_sql(
                    "TRUNCATE TABLE {table} CASCADE",
                    dict(table=Identifier(target, table)),
                    raise_on_error=True,
                )

        for table in tables:
            source_cols = _table_columns(db, source, table)
            target_cols = set(_table_columns(db, target, table))
            # Preserve target definition order; copy only columns present on both sides.
            common = [c for c in source_cols if c in target_cols]
            if not common:
                print(f"  ! {table}: no shared columns, skipped")
                continue

            col_list = SQL(", ").join(Identifier(c) for c in common)
            db.run_sql(
                "INSERT INTO {target} ({cols}) SELECT {cols} FROM {source}",
                dict(
                    target=Identifier(target, table),
                    source=Identifier(source, table),
                    cols=col_list,
                ),
                raise_on_error=True,
            )
            n = db.run_query(
                "SELECT count(*) FROM {table}",
                dict(table=Identifier(target, table)),
            ).scalar()
            print(f"  copied {table}: {n} rows ({len(common)} columns)")
    finally:
        for table in tables:
            db.run_sql(
                "ALTER TABLE {table} ENABLE TRIGGER ALL",
                dict(table=Identifier(target, table)),
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


def plan_projects(db: Database):
    """Print what a migration would move, reading only (changes nothing).

    Reports, per legacy project, the canvases (data + topology) and the auxiliary
    schemas + public project tables that would be carried into the merged database.
    """
    projects = db.run_query(
        "SELECT id, slug, uuid FROM mapboard.project WHERE derived_from IS NULL ORDER BY id"
    ).all()

    print(f"{len(projects)} legacy project(s) would be migrated.\n")
    for project in projects:
        print(f"Project {project.id} [{project.slug}]:")
        canvases = _get_canvases(db, project.id)
        source_data_schemas = [c.data_schema for c in canvases if c.database != "mapboard"]
        source_databases = sorted({c.database for c in canvases if c.database != "mapboard"})

        for c in canvases:
            print(
                f"  canvas ({c.type}): {c.database}.{c.data_schema}"
                f"  [+ topology {c.topo_schema}]"
            )

        for source_database in source_databases:
            src = Database(connection_string(source_database))
            aux = auxiliary_schemas(src, canvas_schemas=source_data_schemas)
            pub = public_project_tables(src)
            print(f"  auxiliary schemas from {source_database}: {', '.join(aux) or '(none)'}")
            print(f"  public project tables from {source_database}: {', '.join(pub) or '(none)'}")
        print()


def delete_migrated_projects(db: Database):
    """Delete all projects that were created as part of the migration process."""

    # Get a list of projects to delete
    projects = db.run_query(
        "SELECT id, slug, uuid FROM mapboard.project WHERE derived_from IS NOT NULL;"
    ).all()

    for project in projects:
        print(f"Deleting project {project.id} ({project.slug})...")
        # Get a list of contexts associated with the project
        canvases = _get_canvases(db, project.id)
        for context in canvases:
            # Drop the topology first (it references the topo schema by name).
            if context.topo_schema is not None:
                db.run_sql(
                    "SELECT topology.DropTopology(name) FROM topology.topology WHERE name = :topo_name",
                    dict(topo_name=context.topo_schema),
                )

            # Drop the actual schemas recorded on the canvas, plus any leftover
            # import-staging schema. Using the stored names (rather than recomputing)
            # means this stays correct even across schema-naming changes.
            schema_names = [
                context.data_schema,
                context.topo_schema,
                target_schema_name(project, context, type="import"),
            ]
            for schema_name in schema_names:
                if not schema_name:
                    continue
                db.run_sql(
                    "DROP SCHEMA IF EXISTS {schema} CASCADE",
                    dict(schema=Identifier(schema_name)),
                    raise_on_error=True,
                )

        # Finally, delete the project metadata
        db.run_sql(
            "SELECT mapboard.delete_project_metadata(:project_id);",
            dict(project_id=project.id),
        )
        db.session.commit()


def _get_canvases(db, project_id):
    """Get canvases associated with a project."""
    return db.run_query(
        """
        SELECT id, type::text type, data_schema, topo_schema, database, tolerance, srid, uuid, legacy
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

    # Capture the legacy source(s) before migrate_canvas rewrites the canvas rows.
    canvases = _get_canvases(db, new_project_id)
    source_data_schemas = [c.data_schema for c in canvases if c.database != "mapboard"]
    source_databases = sorted(
        {c.database for c in canvases if c.database != "mapboard"}
    )

    # Migrate topology-managed canvases (data + topology schemas).
    for context in canvases:
        migrate_canvas(db, new_project, context)

    # Migrate the project's other (arbitrary) schemas + public project data.
    for source_database in source_databases:
        migrate_auxiliary_schemas(
            db,
            new_project,
            source_database,
            canvas_schemas=source_data_schemas,
        )


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

    # Record the human-readable identity on the schemas themselves (the schema
    # *name* is keyed on the stable canvas UUID, so the slug can drift), and register
    # both in the project-schema inventory.
    for schema, role, kind in [
        (data_schema, "data", "canvas_data"),
        (topo_schema, "topology", "canvas_topo"),
    ]:
        db.run_sql(
            "COMMENT ON SCHEMA {schema} IS :label",
            dict(
                schema=Identifier(schema),
                label=f"{project.slug} — {context.type} ({role})",
            ),
        )
        source_name = context.data_schema if role == "data" else context.topo_schema
        _register_project_schema(
            db, project.id, schema, source_name, kind, canvas_id=context.id
        )

    # Copy data from the old schema. When it lives in a different database we stage
    # it through a transient FDW "import" schema, then tear that (and the foreign
    # server) down afterwards so no cruft is left behind.
    old_db = Database(connection_string(context.database))
    old_data_schema = context.data_schema

    foreign_server = None
    import_schema = None
    src_schema = old_data_schema
    try:
        if context.database != "mapboard":
            import_schema = target_schema_name(project, context, type="import")
            foreign_server = create_foreign_server(db, old_db)
            map_foreign_schema(
                db, foreign_server, import_schema, foreign_schema=old_data_schema
            )
            src_schema = import_schema

        copy_schema_data(
            db,
            source=src_schema,
            target=data_schema,
            truncate=True,
        )
    finally:
        if import_schema is not None:
            db.run_sql(
                "DROP SCHEMA IF EXISTS {schema} CASCADE",
                dict(schema=Identifier(import_schema)),
            )
        if foreign_server is not None:
            drop_foreign_server(db, foreign_server)

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
    """Schema name for a canvas's data / topology / import-staging schema.

    Layout: ``mb_<slug>_<canvas-type>_<kind>_<canvas-uuid8>`` — e.g.
    ``mb_naukluft_map_data_4d7fdc12`` and ``mb_naukluft_map_topo_4d7fdc12``.

    The canvas-identifying part (slug + canvas type) comes *before* ``<kind>``, so a
    map's data and topo schemas sort next to each other and a project's schemas
    cluster together in listings. Identity is the canvas UUID (stable across
    renames); the slug is a human hint only (also stored as a COMMENT ON SCHEMA).
    ``type`` is one of ``data``, ``topo``, or ``import`` (transient FDW staging).
    """
    uid = str(context.uuid)[0:8]

    slug_base = project.slug
    # UUID already guarantees uniqueness, so drop any "-copy" suffix from the hint.
    if slug_base.endswith("-copy"):
        slug_base = slug_base[: -len("-copy")]
    slug_hint = simplify_slug(slug_base)[:20].strip("_")

    canvas_type = simplify_slug(str(context.type))

    name = f"mb_{slug_hint}_{canvas_type}_{type}_{uid}"

    # Never exceed Postgres's 63-char identifier limit (it truncates silently,
    # which would collide schema names). Trim the cosmetic slug hint if needed.
    if len(name) > 63:
        keep = len(slug_hint) - (len(name) - 63)
        slug_hint = slug_hint[: max(0, keep)].strip("_")
        name = f"mb_{slug_hint}_{canvas_type}_{type}_{uid}"
    return name


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

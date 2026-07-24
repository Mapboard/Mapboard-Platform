"""
Utilities to migrate the Mapboard database to a single multi-tenant setup
(with multiple data schemas).
"""

import asyncio
import os
from datetime import datetime
from pathlib import Path

from .backup_cluster import pg_dump_cluster
from macrostrat.database import Database
from macrostrat.database.transfer import pg_dump_to_file
from macrostrat.database.transfer.move_tables import move_tables
from macrostrat.database.utils import temporary_database
from psycopg.sql import Identifier, SQL, Literal

import re
from mapboard.core.settings import connection_string, POSTGRES_IMAGE
from mapboard.topology_manager import create_context, TopologyManager
from mapboard.cli.fixtures import apply_fixtures


def snapshot_registry(db: Database, *, reason: str = "migration") -> Path:
    """Dump the `mapboard` schema (the project/canvas/context registry) to a
    timestamped file before a destructive migration step — an always-on rollback point.

    The registry is small but irreplaceable: its UUIDs/contexts *name* every ``mb_*``
    data schema, so losing it orphans all migrated data. The dump captures only the
    `mapboard` schema (fast, a few MB); the ``mb_*`` data schemas are re-derivable from
    the legacy sources. Location is ``$MAPBOARD_SNAPSHOT_DIR`` or ``~/.mapboard/snapshots``.
    """
    snapshot_dir = Path(
        os.environ.get("MAPBOARD_SNAPSHOT_DIR", Path.home() / ".mapboard" / "snapshots")
    )
    snapshot_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    path = snapshot_dir / f"mapboard-registry-{reason}-{stamp}.pg-dump"

    print(f"Snapshotting mapboard registry (rollback point) -> {path}")
    asyncio.run(
        pg_dump_to_file(
            db.engine,
            path,
            args=["--schema", "mapboard"],
            postgres_container=POSTGRES_IMAGE,
        )
    )
    return path


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


def _row_count(db, schema, table) -> int:
    """Row count for a single table (works across FDW foreign tables too)."""
    return db.run_query(
        "SELECT count(*) FROM {table}", dict(table=Identifier(schema, table))
    ).scalar()


def verify_row_counts(
    src_db, src_schema, tgt_db, tgt_schema, *, tables=None
) -> list[tuple]:
    """Compare per-table row counts between a source and target schema.

    Row-count parity is the primary check that a table migration actually moved its
    data (structure is bootstrapped optimistically, so equal counts are the signal that
    the copy succeeded). Returns a list of ``(table, source_count, target_count)`` for
    every table that does not match or is missing from the target; empty means all good.
    Each table is reported as it is checked.
    """
    src_tables = set(_schema_tables(src_db, src_schema))
    if tables is not None:
        src_tables &= set(tables)
    tgt_tables = set(_schema_tables(tgt_db, tgt_schema))

    problems = []
    for table in sorted(src_tables):
        src_n = _row_count(src_db, src_schema, table)
        if table not in tgt_tables:
            print(f"    verify {tgt_schema}.{table}: source={src_n} target=MISSING  !! MISSING")
            problems.append((table, src_n, None))
            continue
        tgt_n = _row_count(tgt_db, tgt_schema, table)
        ok = src_n == tgt_n
        print(
            f"    verify {tgt_schema}.{table}: source={src_n} target={tgt_n}"
            + ("" if ok else "  !! MISMATCH")
        )
        if not ok:
            problems.append((table, src_n, tgt_n))
    return problems


def _raise_on_mismatch(problems, context: str):
    """Fail loudly if verify_row_counts found any mismatch/missing table."""
    if not problems:
        return
    detail = "; ".join(
        f"{t}: source={s}, target={'MISSING' if g is None else g}"
        for t, s, g in problems
    )
    raise RuntimeError(f"Row-count verification failed for {context}: {detail}")


def clone_schema(from_db, to_db, *, schemas=None, tables=None, container=None):
    """Clone schemas and/or tables verbatim (structure + data) from one database to
    another via ``pg_dump | pg_restore``. Objects land under their ORIGINAL names; the
    caller renames / relocates and verifies them.

    Two deliberate behaviours:

    - **Selectors are never mixed in one invocation.** Combining pg_dump ``--schema`` and
      ``--table`` silently drops the ``--schema`` selections, so tables and schemas are
      dumped in separate passes — **tables first**, so a foreign key from a cloned schema
      into a standalone cloned table (e.g. a ``public`` table) resolves on restore.
    - **The restore is error-tolerant.** Objects whose dependencies were intentionally
      left behind (e.g. a canvas trigger that calls an un-cloned topology schema's
      function) fail and are logged rather than raised. Correctness is confirmed by the
      caller's row-count verification, which also surfaces anything that didn't
      materialise.

    Identifiers are double-quoted before they reach pg_dump: ``--schema`` / ``--table``
    take *patterns*, where an unquoted dot is a schema.object separator (so a schema
    literally named ``…0.0.4`` fails with "too many dotted names") and ``* ? [`` are
    wildcards. Quoting forces a literal match.

    Both databases happen to live on the same server here, but this works cross-host too.
    Candidate for promotion to ``macrostrat.database`` once proven.
    """
    schemas = list(schemas or [])
    tables = list(tables or [])
    if not schemas and not tables:
        return
    container = container or POSTGRES_IMAGE

    def _q(ident: str) -> str:
        # Quote one identifier literally for a pg_dump pattern.
        return '"' + ident.replace('"', '""') + '"'

    def _q_table(qualified: str) -> str:
        # 'schema.table' -> '"schema"."table"' (split on the first dot).
        schema, sep, table = qualified.partition(".")
        return f"{_q(schema)}.{_q(table)}" if sep else _q(qualified)

    if tables:
        asyncio.run(
            move_tables(
                from_db.engine,
                to_db.engine,
                tables=[_q_table(t) for t in tables],
                restore_args=["--no-owner"],
                postgres_container=container,
            )
        )
    if schemas:
        asyncio.run(
            move_tables(
                from_db.engine,
                to_db.engine,
                schemas=[_q(s) for s in schemas],
                restore_args=["--no-owner"],
                postgres_container=container,
            )
        )


def clone_schema_as(source_db, target_db, source_schema, target_schema, *, container=None):
    """Clone a single schema from ``source_db`` into ``target_db``, renamed to
    ``target_schema``.

    Prefers a **direct** clone (restore under the source name, then ``ALTER SCHEMA
    RENAME``). ``pg_restore`` cannot rename on restore, so when a schema with the
    source's name already exists in the target — e.g. a source schema literally named
    ``mapboard`` would otherwise land on the core registry schema, and a same-database
    clone would collide with itself — the clone is **staged** through a throwaway temp
    database (created from the PostGIS template so geometry/topogeometry types exist):
    restore there, rename, then clone the now non-colliding schema across.
    """
    collides = (
        target_db.run_query(
            "SELECT 1 FROM information_schema.schemata WHERE schema_name = :s",
            dict(s=source_schema),
        ).scalar()
        is not None
    )

    def _rename(db, old, new):
        if old != new:
            db.run_sql(
                "ALTER SCHEMA {old} RENAME TO {new}",
                dict(old=Identifier(old), new=Identifier(new)),
                raise_errors=True,
            )

    if not collides:
        clone_schema(source_db, target_db, schemas=[source_schema], container=container)
        _rename(target_db, source_schema, target_schema)
        return

    print(f"    staging '{source_schema}' via temp db (name collides in target)")
    staging_url = target_db.engine.url.set(database="mapboard_migrate_staging")
    with temporary_database(staging_url, template="template_postgis", ensure_empty=True) as eng:
        staging = Database(eng)
        # Ensure the topology type exists in the staging db for topogeometry columns.
        staging.run_sql("CREATE EXTENSION IF NOT EXISTS postgis_topology")
        clone_schema(source_db, staging, schemas=[source_schema], container=container)
        _rename(staging, source_schema, target_schema)
        clone_schema(staging, target_db, schemas=[target_schema], container=container)


# --- Project-scoped (auxiliary) schema discovery, naming & migration ---------

# Schemas that are never project data: PostgreSQL/PostGIS system schemas, extension
# and tooling schemas, the core Mapboard schemas (leftovers in the legacy per-project
# databases), canvas data-layout schemas (the registered canvas ones are excluded via
# canvas_schemas; listing them here also catches *leftover copies*), scratch, and
# regenerable/derived data. PostGIS topologies (``*_topology``) are rebuilt separately;
# large rasters are excluded by decision.
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
    # Canvas data-layout schema names — never auxiliary (a stray copy is a leftover).
    "map_digitizer",
    "cross_section",
    # Scratch.
    "test",
}

# Non-project objects in a legacy database's `public` schema: the PostGIS catalog,
# imported OpenStreetMap basemap (regenerable, excluded by decision), and the QGIS
# project-storage table (tooling).
PUBLIC_SYSTEM_TABLES = {
    "spatial_ref_sys",
    "geometry_columns",
    "geography_columns",
    "raster_columns",
    "raster_overviews",
    "layer",
    "topology",
    "qgis_projects",
    # Core registry tables — NEVER clone these into the merged DB's public schema
    # (a `public.<t>` clone lands on the core object and would clobber it).
    "projects",
    "users",
}


def _is_system_schema(name: str) -> bool:
    """True if a schema holds system/tooling/derived data rather than project data."""
    if name in SYSTEM_SCHEMAS:
        return True
    if name.endswith("_topology"):  # PostGIS topologies — rebuilt separately
        return True
    if name.endswith("_bak"):  # legacy backups — skipped by decision
        return True
    if name.endswith("_export"):  # derived/export schemas — regenerable
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


# Schema-name length budget. Postgres identifiers cap at 63 bytes; we stay well under.
# The slug hint is cosmetic (identity is the project UUID) so it may be truncated; the
# discriminator (canvas slug / source schema name) must not be, so an over-budget name
# raises rather than silently colliding. Canvas slugs are additionally bounded by a CHECK
# constraint (<= 24) in core-fixtures/01-schema.sql.
_SLUG_HINT_MAX = 16
_SCHEMA_NAME_MAX = 63


def project_schema_name(
    project, discriminator: str, *, suffix: str | None = None
) -> str:
    """Namespaced name for any schema a project owns, on one unified scheme:

        mb_<slug>_<project-uuid8>_<discriminator>[_<suffix>]

    Every schema a project owns shares the prefix ``mb_<slug>_<uuid8>_`` — uniform and
    unique per project, so it can be globbed over. ``discriminator`` is the canvas slug
    (canvas schemas), the source schema name (auxiliary), or ``"base"``; ``suffix`` is
    ``data`` / ``topo`` / ``import`` for canvas schemas and omitted otherwise.

    Identity is the project UUID; the slug is a cosmetic hint (also recorded as a
    COMMENT ON SCHEMA) and may be truncated. The discriminator is never truncated — an
    over-length name raises, so names never silently collide.
    """
    uid = str(project.uuid)[0:8]

    slug_base = project.slug
    if slug_base.endswith("-copy"):
        slug_base = slug_base[: -len("-copy")]
    slug_hint = simplify_slug(slug_base)[:_SLUG_HINT_MAX].strip("_")

    disc = simplify_slug(discriminator).strip("_")
    tail = disc if suffix is None else f"{disc}_{simplify_slug(suffix)}"

    name = f"mb_{slug_hint}_{uid}_{tail}"
    if len(name) > _SCHEMA_NAME_MAX:
        raise ValueError(
            f"Schema name exceeds {_SCHEMA_NAME_MAX} chars ({len(name)}): {name!r}. "
            f"Shorten the discriminator ({discriminator!r})."
        )
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

    # Clear any leftover intermediate objects from a prior aborted run so the clone
    # restores cleanly (clone_schema lands objects under their original names before we
    # rename/relocate them).
    for schema in aux:
        db.run_sql(
            "DROP SCHEMA IF EXISTS {s} CASCADE", dict(s=Identifier(schema))
        )
    for t in pub_tables:
        db.run_sql(
            "DROP TABLE IF EXISTS public.{t} CASCADE", dict(t=Identifier(t))
        )
    db.session.commit()

    # Clone the science schemas (as one group, preserving their intra-group cross-schema
    # FKs) together with the public project tables in a SINGLE call — clone_schema does
    # the tables pass first, so a schema's FK into a public table (e.g. section ->
    # public.photo) resolves on restore. Everything lands under original names.
    clone_schema(
        source_db,
        db,
        schemas=list(aux),
        tables=[f"public.{t}" for t in pub_tables],
    )
    db.session.commit()

    problems = []

    # Verify clone fidelity BEFORE renaming/relocating (objects are still under their
    # original names here), then namespace + register each.
    for source_name in aux:
        problems += verify_row_counts(source_db, source_name, db, source_name)
        target = project_schema_name(project, source_name)
        db.run_sql(
            "ALTER SCHEMA {old} RENAME TO {new}",
            dict(old=Identifier(source_name), new=Identifier(target)),
            raise_errors=True,
        )
        db.run_sql(
            "COMMENT ON SCHEMA {schema} IS {label}",
            dict(
                schema=Identifier(target),
                label=Literal(f"{project.slug} — {source_name}"),
            ),
        )
        _register_project_schema(db, project.id, target, source_name, "auxiliary")
        print(f"    {source_name} -> {target}")

    # Collect the project's public data into a single base schema (FKs into these tables
    # follow the SET SCHEMA move because they bind to table identity, not name).
    if pub_tables:
        problems += verify_row_counts(source_db, "public", db, "public", tables=pub_tables)
        base = project_schema_name(project, "base")
        db.run_sql(
            "CREATE SCHEMA IF NOT EXISTS {schema}",
            dict(schema=Identifier(base)),
            raise_errors=True,
        )
        for t in pub_tables:
            db.run_sql(
                "ALTER TABLE public.{table} SET SCHEMA {schema}",
                dict(table=Identifier(t), schema=Identifier(base)),
                raise_errors=True,
            )
        db.run_sql(
            "COMMENT ON SCHEMA {schema} IS {label}",
            dict(
                schema=Identifier(base),
                label=Literal(f"{project.slug} — base (from public)"),
            ),
        )
        _register_project_schema(db, project.id, base, "public", "base")
        print(f"    public project tables -> {base}")

    _raise_on_mismatch(problems, f"auxiliary schemas from {source_database}")

    db.session.commit()


def migrate_projects(db: Database, only_slug: str = None):
    """
    Major data migration:
    Migrate all projects from the original multi-database setup to a multi-schema design.

    ``only_slug`` limits the run to a single project (by original slug) — useful for
    re-importing one project after fixing a project-specific issue.
    """
    snapshot_registry(db, reason="migrate")
    # Start from a clean topology catalog: prune orphaned topology.topology / topology.layer
    # rows left by prior aborted runs (safe here — no in-flight topology yet).
    drop_unreferenced_topologies(db)

    # Legacy projects that don't yet have a modern project derived from them (optionally
    # limited to one slug).
    where = "p2.id IS NULL AND p.derived_from IS NULL"
    params = {}
    if only_slug is not None:
        where += " AND p.slug = :only_slug"
        params["only_slug"] = only_slug
    sql = f"""
    SELECT p.id, p.slug, p.uuid
    FROM mapboard.project p
    LEFT JOIN mapboard.project p2 ON p2.derived_from = p.id
    WHERE {where};
    """

    projects = db.run_query(sql, params).all()

    print(f"Found {len(projects)} projects to migrate.")

    # Isolate each project: one project's failure (e.g. a schema-drift incompatibility)
    # must not abort the whole batch. Failures are collected and reported loudly at the
    # end, after everything that CAN migrate has. Successful projects are already
    # committed; a failed project leaves a partial derived copy that the next
    # `--delete` cleans up before a retry.
    failures = []
    for project in projects:
        print(f"Migrating project {project.id} ({project.slug})...")
        try:
            migrate_project(db, project)
        except Exception as err:  # noqa: BLE001 — batch isolation, re-raised in summary
            db.session.rollback()
            print(f"  !! FAILED: {project.slug}: {err}")
            failures.append((project.slug, str(err)))

    ok = len(projects) - len(failures)
    print(f"\nMigrated {ok}/{len(projects)} project(s).")
    if failures:
        detail = "\n  - ".join(f"{slug}: {err}" for slug, err in failures)
        raise RuntimeError(
            f"{len(failures)} project(s) failed to migrate:\n  - {detail}"
        )


def promote_migrated_projects(db: Database, only_slug: str = None):
    """Promote derived (``-copy``) projects to canonical.

    For each copy: clear ``derived_from``, delete the legacy original's metadata (its
    per-project source database is left untouched), then rename the copy to the
    original's slug/title. End state: one canonical project per map, no ``-copy``
    suffixes, no legacy originals in the registry.
    """
    snapshot_registry(db, reason="promote")

    where = "c.derived_from IS NOT NULL"
    params = {}
    if only_slug is not None:
        where += " AND o.slug = :only_slug"
        params["only_slug"] = only_slug
    copies = db.run_query(
        f"""
        SELECT c.id AS copy_id, c.slug AS copy_slug,
               o.id AS orig_id, o.slug AS orig_slug, o.title AS orig_title
        FROM mapboard.project c
        JOIN mapboard.project o ON c.derived_from = o.id
        WHERE {where}
        ORDER BY o.id
        """,
        params,
    ).all()

    for r in copies:
        print(f"Promoting {r.copy_slug!r} -> {r.orig_slug!r} (retiring legacy original id {r.orig_id})")
        # 1. break the derived_from link so the original can be deleted (FK is NO ACTION)
        db.run_sql(
            "UPDATE mapboard.project SET derived_from = NULL WHERE id = :id",
            dict(id=r.copy_id),
        )
        # 2. delete the legacy original's metadata (source database untouched)
        db.run_sql(
            "SELECT mapboard.delete_project_metadata(:id)", dict(id=r.orig_id)
        )
        # 3. rename the copy to canonical (slug is free now)
        db.run_sql(
            "UPDATE mapboard.project SET slug = :slug, title = :title WHERE id = :id",
            dict(slug=r.orig_slug, title=r.orig_title, id=r.copy_id),
        )
        db.session.commit()

    print(f"Promoted {len(copies)} project(s) to canonical.")


def plan_projects(db: Database, only_slug: str = None):
    """Print what a migration would move, reading only (changes nothing).

    Reports, per legacy project, the canvases (data + topology) and the auxiliary
    schemas + public project tables that would be carried into the merged database.
    ``only_slug`` limits the report to a single project.
    """
    where = "derived_from IS NULL"
    params = {}
    if only_slug is not None:
        where += " AND slug = :only_slug"
        params["only_slug"] = only_slug
    projects = db.run_query(
        f"SELECT id, slug, uuid FROM mapboard.project WHERE {where} ORDER BY id",
        params,
    ).all()

    print(f"{len(projects)} legacy project(s) would be migrated.\n")
    for project in projects:
        print(f"Project {project.id} [{project.slug}]:")
        canvases = _get_canvases(db, project.id)
        source_data_schemas = [
            c.data_schema for c in canvases if c.database != "mapboard"
        ]
        source_databases = sorted(
            {c.database for c in canvases if c.database != "mapboard"}
        )

        for c in canvases:
            print(
                f"  canvas ({c.type}): {c.database}.{c.data_schema}"
                f"  [+ topology {c.topo_schema}]"
            )

        for source_database in source_databases:
            src = Database(connection_string(source_database))
            aux = auxiliary_schemas(src, canvas_schemas=source_data_schemas)
            pub = public_project_tables(src)
            print(
                f"  auxiliary schemas from {source_database}: {', '.join(aux) or '(none)'}"
            )
            print(
                f"  public project tables from {source_database}: {', '.join(pub) or '(none)'}"
            )
        print()


def _drop_migration_schema(db, name):
    """Drop a schema ONLY if it is migration-owned (``mb_`` prefixed).

    Every schema the migration creates is ``mb_<slug>_…``. A canvas/registry row can
    still reference a *source* schema name (e.g. ``mapboard``) when a copy's migration
    was interrupted before finalizing — dropping that blindly would take out a core
    schema (this is how the registry got wiped). So anything not ``mb_``-prefixed is
    refused.
    """
    if not name:
        return
    if not name.startswith("mb_"):
        print(f"    refusing to drop non-migration schema {name!r} (not mb_-prefixed)")
        return
    db.run_sql(
        "DROP SCHEMA IF EXISTS {schema} CASCADE",
        dict(schema=Identifier(name)),
        raise_errors=True,
    )


def delete_migrated_projects(db: Database, only_slug: str = None):
    """Delete the derived (migrated) projects and their schemas.

    ``only_slug`` limits deletion to the copy derived from that original slug (so a
    single project can be re-imported without disturbing the others).
    """
    snapshot_registry(db, reason="delete")

    # Derived copies to delete — optionally just the one derived from ``only_slug``.
    where = "derived_from IS NOT NULL"
    params = {}
    if only_slug is not None:
        where += (
            " AND derived_from IN (SELECT id FROM mapboard.project WHERE slug = :only_slug)"
        )
        params["only_slug"] = only_slug
    projects = db.run_query(
        f"SELECT id, slug, uuid FROM mapboard.project WHERE {where};", params
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

            # Drop the schemas recorded on the canvas — but only migration-owned ones.
            # An interrupted copy can leave the canvas pointing at its SOURCE schema name
            # (e.g. 'mapboard'); dropping that would take out a core schema.
            for schema_name in (context.data_schema, context.topo_schema):
                _drop_migration_schema(db, schema_name)

        # Drop the project's auxiliary / base schemas recorded in the inventory.
        aux_schemas = (
            db.run_query(
                """
            SELECT schema_name FROM mapboard.project_schema
            WHERE project_id = :project_id AND kind IN ('auxiliary', 'base')
            """,
                dict(project_id=project.id),
            )
            .scalars()
            .all()
        )
        for schema_name in aux_schemas:
            _drop_migration_schema(db, schema_name)

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
        SELECT id, type::text type, slug, data_schema, topo_schema, database, tolerance, srid, uuid, legacy
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
    """Migrate a single canvas to the new schema design."""
    print(f"  Canvas {context.id} ({context.type})...")

    # Every canvas needs a slug that is unique within the project — it becomes the
    # canvas segment of the schema names. Default it from the canvas type; a project
    # with multiple canvases of one type would need distinct slugs set explicitly.
    canvas_slug = context.slug or simplify_slug(str(context.type))
    db.run_sql(
        "UPDATE mapboard.canvas SET slug = :slug WHERE id = :id",
        dict(slug=canvas_slug, id=context.id),
        raise_errors=True,
    )

    data_schema = project_schema_name(project, canvas_slug, suffix="data")
    print(f"  Target schema (data): {data_schema}")

    topo_schema = project_schema_name(project, canvas_slug, suffix="topo")
    print(f"  Target schema (topo): {topo_schema}")

    if (
        context.data_schema == data_schema
        and context.topo_schema == topo_schema
        and not context.legacy
    ):
        print("  Context already migrated, skipping.")
        return

    source_db = Database(connection_string(context.database))
    source_schema = context.data_schema

    # 1. Clone the source data schema verbatim (every table/column, nothing dropped)
    #    into data_schema. clone_schema_as stages via a temp db if the source name
    #    collides in the target (e.g. a source schema named 'mapboard').
    print(f"  Cloning {context.database}.{source_schema} -> {data_schema}")
    clone_schema_as(source_db, db, source_schema, data_schema)
    db.session.commit()

    # 2. Data-integrity gate: the clone must match the source row-for-row — checked
    #    BEFORE the topology re-sync, which may seed fixture default rows.
    _raise_on_mismatch(
        verify_row_counts(source_db, source_schema, db, data_schema),
        f"{context.database}.{source_schema} -> {data_schema}",
    )

    # 3. Reconcile legacy column-name drift on the cloned linework: older schemas (e.g.
    #    provo) named the map-layer FK column 'layer' before it was renamed to 'map_layer'
    #    (which the topology system now requires). Rename it on the clone — semantics are
    #    identical (a FK to map_layer) and the source stays untouched.
    linework_cols = set(
        db.run_query(
            """
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = :s AND table_name = 'linework'
            """,
            dict(s=data_schema),
        )
        .scalars()
        .all()
    )
    if "layer" in linework_cols and "map_layer" not in linework_cols:
        print("    reconciling drifted column linework.layer -> map_layer")
        db.run_sql(
            "ALTER TABLE {table} RENAME COLUMN layer TO map_layer",
            dict(table=Identifier(data_schema, "linework")),
            raise_errors=True,
        )

    # 4. Drop the topology-derived columns the fixtures own (topo TopoGeometry + the
    #    cloned check_topogeom_topo tied to the *source* topology, plus geometry_hash /
    #    topology_error). The re-sync re-adds them: topo bound to the NEW topology, the
    #    rest NULL — which is exactly the reset topology needs before it's rebuilt.
    for col in ("topo", "geometry_hash", "topology_error"):
        db.run_sql(
            "ALTER TABLE {table} DROP COLUMN IF EXISTS {col} CASCADE",
            dict(table=Identifier(data_schema, "linework"), col=Identifier(col)),
            raise_errors=True,
        )

    # 4. Re-sync the canonical topology structure onto the cloned schema: creates the
    #    topology schema, re-adds the topo column + topology triggers/views, sets up
    #    identity. Fixtures are CREATE/ADD ... IF NOT EXISTS, so cloned tables are
    #    reconciled (extra source tables/columns are preserved for later).
    ctx = create_context(
        db,
        data_schema=data_schema,
        topo_schema=topo_schema,
        tolerance=context.tolerance,
        srid=context.srid,
    )
    apply_fixtures(TopologyManager(ctx))

    # 5. Record identity on the schemas and register both in the inventory.
    for schema, role, kind in [
        (data_schema, "data", "canvas_data"),
        (topo_schema, "topology", "canvas_topo"),
    ]:
        db.run_sql(
            "COMMENT ON SCHEMA {schema} IS {label}",
            dict(
                schema=Identifier(schema),
                label=Literal(f"{project.slug} — {context.type} ({role})"),
            ),
        )
        source_name = source_schema if role == "data" else context.topo_schema
        _register_project_schema(
            db, project.id, schema, source_name, kind, canvas_id=context.id
        )

    # 6. Finalize the canvas record.
    db.run_sql(
        """
        UPDATE mapboard.canvas SET
            database = 'mapboard',
            data_schema = :data_schema,
            topo_schema = :topo_schema,
            tolerance = :tolerance,
            legacy = FALSE,
            srid = :srid
        WHERE id = :context_id
          AND project_id = :project_id
        """,
        dict(
            project_id=project.id,
            context_id=context.id,
            data_schema=data_schema,
            topo_schema=topo_schema,
            tolerance=context.tolerance,
            srid=context.srid,
        ),
    )
    db.session.commit()


def simplify_slug(slug: str, spacer="_") -> str:
    """Simplify a project slug to be used in schema names."""
    # Lowercase, replace non-alphanumeric with underscores
    simplified = re.sub(r"[^a-z0-9]+", spacer, slug.lower())
    return simplified.strip("_")


def drop_unreferenced_topologies(db: Database):
    """Prune invalid / orphaned rows from the PostGIS topology catalog.

    A bare ``DROP SCHEMA … CASCADE`` and aborted migrations leave rows behind in
    ``topology.topology`` / ``topology.layer`` — only ``topology.DropTopology()`` removes
    them properly, and it can't act once the schema is gone. This removes:

    - ``topology.layer`` rows whose ``schema.table.feature_column`` no longer exists;
    - topologies not referenced by any ``mapboard.canvas.topo_schema`` — via
      ``DropTopology()`` when the schema still exists, else by deleting the catalog rows
      directly.

    Run at a quiescent point (e.g. before a migration), never mid-canvas: a freshly
    created topology is briefly unreferenced until its canvas row is finalized.
    """
    # 1. Orphaned layer registrations (their schema/table/column is gone).
    db.run_sql(
        """
        DELETE FROM topology.layer l
        WHERE NOT EXISTS (
            SELECT 1 FROM information_schema.columns c
            WHERE c.table_schema = l.schema_name
              AND c.table_name = l.table_name
              AND c.column_name = l.feature_column
        )
        """,
        raise_errors=True,
    )

    # 2. Topologies no canvas references.
    orphans = db.run_query(
        """
        SELECT t.id, t.name,
               (t.name IN (SELECT nspname FROM pg_namespace)) AS schema_exists
        FROM topology.topology t
        WHERE t.name NOT IN (
            SELECT topo_schema FROM mapboard.canvas WHERE topo_schema IS NOT NULL
        )
        """
    ).all()
    for o in orphans:
        if o.schema_exists:
            print(f"  DropTopology({o.name})")
            db.run_sql("SELECT topology.DropTopology(:name)", dict(name=o.name))
        else:
            print(f"  purging catalog rows for {o.name} (schema already gone)")
            db.run_sql(
                "DELETE FROM topology.layer WHERE topology_id = :id", dict(id=o.id)
            )
            db.run_sql("DELETE FROM topology.topology WHERE id = :id", dict(id=o.id))
    db.session.commit()


def drop_orphaned_project_schemas(db: Database):
    """Drop migration-owned (``mb_``) schemas that no canvas or project_schema row
    references — leftovers from interrupted/aborted runs.

    Only ``mb_``-prefixed schemas are ever considered (via ``_drop_migration_schema``),
    so a core/source schema can never be caught. Run at a quiescent point (like the
    topology cleanup): an in-flight migration's freshly created schema is briefly
    unreferenced until its canvas row is finalized.
    """
    orphans = (
        db.run_query(
            r"""
            SELECT n.nspname
            FROM pg_namespace n
            WHERE n.nspname LIKE 'mb\_%'
              AND n.nspname NOT IN (
                  SELECT data_schema FROM mapboard.canvas WHERE data_schema IS NOT NULL
                  UNION
                  SELECT topo_schema FROM mapboard.canvas WHERE topo_schema IS NOT NULL
                  UNION
                  SELECT schema_name FROM mapboard.project_schema
              )
            ORDER BY n.nspname
            """
        )
        .scalars()
        .all()
    )
    for name in orphans:
        print(f"  dropping orphaned schema {name}")
        _drop_migration_schema(db, name)
    db.session.commit()

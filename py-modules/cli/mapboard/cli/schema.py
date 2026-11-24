"""Mapboard's core database schema, described for `macrostrat.schema_management`.

Project schemas (`mb_*`) are not part of it: they are built per canvas by the
topology manager, and a plan only compares schemas the declarative build creates.
"""

from contextlib import contextmanager
from pathlib import Path

from macrostrat.app_frame import AccessScope
from macrostrat.database import Database
from macrostrat.database.utils import create_database
from macrostrat.schema_management import (
    EnvironmentClass,
    SchemaApp,
    SchemaDefinition,
    reload_postgrest_schema,
    scratch_database,
)
from mapboard.core.settings import APP_OWNER, MAPBOARD_ROOT, admin_database_url

from .config import environments

FIXTURES = Path(__file__).parent.parent.parent / "core-fixtures"
# Plans, and the log of what was applied, per environment; gitignored.
PLANS_DIR = MAPBOARD_ROOT / "_plans"
# Migration modules; the hand-run SQL of the per-database era is in `legacy/`.
MIGRATIONS_DIR = MAPBOARD_ROOT / "migrations"

# Views over one project's schemas, which a scratch database cannot build. The
# transitional API views are synced; `public.photo_note` is Naukluft's own.
UNMANAGED_VIEWS = {
    ("mapboard_api", "polygon_type"),
    ("mapboard_api", "stations"),
    ("mapboard_api", "cross_sections"),
    ("mapboard_api", "cross_section_endpoints"),
    ("mapboard_api", "piercing_points"),
    ("public", "photo_note"),
}


def chunks(owner: str = APP_OWNER) -> list[SchemaDefinition]:
    """The core schema. Chunks after the cluster-level ones are applied as *owner*."""
    return [
        # Cluster-level objects, applied as the connecting role.
        SchemaDefinition(name="roles", provides=[FIXTURES / "00-roles.sql"]),
        SchemaDefinition(name="extensions", provides=[FIXTURES / "00-extensions.sql"]),
        SchemaDefinition(
            name="grants",
            depends_on=["roles", "extensions"],
            provides=[FIXTURES / "00-grants.sql"],
        ),
        SchemaDefinition(
            name="local-roles",
            depends_on=["roles", "extensions"],
            provides=[FIXTURES / "local"],
            environments=[EnvironmentClass.Local],
        ),
        SchemaDefinition(
            name="core",
            depends_on=["grants"],
            owner=owner,
            provides=[
                FIXTURES / "01-schema.sql",
                FIXTURES / "01.1-functions.sql",
                FIXTURES / "01.5-project-schema.sql",
                FIXTURES / "04-copy-project-metadata.sql",
            ],
        ),
        SchemaDefinition(
            name="access",
            owner=owner,
            depends_on=["core"],
            provides=[FIXTURES / "01.6-access.sql"],
        ),
        SchemaDefinition(
            name="tasks",
            owner=owner,
            depends_on=["core"],
            provides=[FIXTURES / "01.7-task-run.sql"],
        ),
        SchemaDefinition(
            name="api",
            owner=owner,
            depends_on=["access"],
            provides=[FIXTURES / "02.0-api.sql"],
        ),
        # Synced like any chunk, but left out of diffs (see `ignore_unmanaged`).
        SchemaDefinition(
            name="api-transitional",
            owner=owner,
            depends_on=["api"],
            provides=[FIXTURES / "02.1-api-transitional.sql"],
        ),
        SchemaDefinition(
            name="api-permissions",
            owner=owner,
            depends_on=["api", "api-transitional"],
            provides=[FIXTURES / "03-permissions.sql"],
        ),
    ]


# Installed by the cluster's operator, not by Mapboard.
CLUSTER_EXTENSIONS = {"pg_stat_statements", "pgaudit"}


def ignore_unmanaged(changes):
    """Keep what Mapboard's schema doesn't own out of a diff, on both sides"""
    for inspector in (changes.i_from, changes.i_target):
        _drop(inspector, ("relations", "views", "selectables", "privileges"), _is_view)
        _drop(inspector, ("extensions",), _is_cluster_extension)
        _drop(inspector, ("relations", "views", "privileges"), _is_cluster_extension_view)


def _drop(inspector, props, predicate):
    for prop in props:
        objects = getattr(inspector, prop, None)
        if isinstance(objects, dict):
            setattr(inspector, prop, {k: v for k, v in objects.items() if not predicate(v)})


def _name(obj):
    return getattr(obj, "schema", None), getattr(obj, "name", None)


def _is_view(obj) -> bool:
    return _name(obj) in UNMANAGED_VIEWS


def _is_cluster_extension(obj) -> bool:
    return getattr(obj, "name", None) in CLUSTER_EXTENSIONS


def _is_cluster_extension_view(obj) -> bool:
    schema, name = _name(obj)
    return schema == "public" and (name or "").startswith("pg_stat_statements")


def schema_app() -> SchemaApp:
    settings = environments.settings
    db = None

    def database() -> Database:
        nonlocal db
        if db is None:
            db = Database(admin_database_url())
        return db

    @contextmanager
    def planning_database():
        with scratch_database(settings.get("planning_image")) as cluster:
            # The image's default database carries the tiger geocoder; start clean.
            url = cluster.engine.url.set(database="mapboard")
            create_database(url)
            plan_db = Database(url)
            try:
                yield plan_db
            finally:
                plan_db.engine.dispose()

    def authorize(action: str, assume_yes: bool):
        environments.require_access(
            AccessScope.Schema, action=action, assume_yes=assume_yes
        )

    return SchemaApp(
        name="mapboard",
        database=database,
        chunks=chunks(),
        owner=APP_OWNER,
        schema_dir=PLANS_DIR,
        migrations_dir=MIGRATIONS_DIR,
        environment=environments.env or "default",
        env_class=environments.env_class,
        planning_database=planning_database,
        # Extension-owned.
        excluded_schemas=["topology"],
        prepare_diff=ignore_unmanaged,
        authorize=authorize,
        after_change=reload_postgrest_schema,
        source_root=MAPBOARD_ROOT,
    )

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
from mapboard.core.settings import MAPBOARD_ROOT, core_db

from .config import environments

FIXTURES = Path(__file__).parent.parent.parent / "core-fixtures"
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


def chunks() -> list[SchemaDefinition]:
    return [
        # Cluster-wide roles, applied as the connecting role.
        SchemaDefinition(name="roles", provides=[FIXTURES / "00-roles.sql"]),
        SchemaDefinition(
            name="local-roles",
            depends_on=["roles"],
            provides=[FIXTURES / "local"],
            environments=[EnvironmentClass.Local],
        ),
        SchemaDefinition(
            name="core",
            depends_on=["roles"],
            provides=[
                FIXTURES / "01-schema.sql",
                FIXTURES / "01.1-functions.sql",
                FIXTURES / "01.5-project-schema.sql",
                FIXTURES / "04-copy-project-metadata.sql",
            ],
        ),
        SchemaDefinition(
            name="access",
            depends_on=["core"],
            provides=[FIXTURES / "01.6-access.sql"],
        ),
        SchemaDefinition(
            name="tasks",
            depends_on=["core"],
            provides=[FIXTURES / "01.7-task-run.sql"],
        ),
        SchemaDefinition(
            name="api",
            depends_on=["access"],
            provides=[FIXTURES / "02.0-api.sql"],
        ),
        # Synced like any chunk, but left out of diffs (see `ignore_unmanaged_views`).
        SchemaDefinition(
            name="api-transitional",
            depends_on=["api"],
            provides=[FIXTURES / "02.1-api-transitional.sql"],
        ),
        SchemaDefinition(
            name="api-permissions",
            depends_on=["api", "api-transitional"],
            provides=[FIXTURES / "03-permissions.sql"],
        ),
    ]


def ignore_unmanaged_views(changes):
    """Keep views over project schemas out of a diff, on both sides"""
    for inspector in (changes.i_from, changes.i_target):
        for prop in ("relations", "views", "selectables", "privileges"):
            objects = getattr(inspector, prop, None)
            if not isinstance(objects, dict):
                continue
            setattr(
                inspector,
                prop,
                {k: v for k, v in objects.items() if not _is_unmanaged(v)},
            )


def _is_unmanaged(obj) -> bool:
    return (getattr(obj, "schema", None), getattr(obj, "name", None)) in UNMANAGED_VIEWS


def schema_app() -> SchemaApp:
    settings = environments.settings

    def database() -> Database:
        return core_db._get()

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
        schema_dir=FIXTURES,
        migrations_dir=MIGRATIONS_DIR,
        environment=environments.env or "default",
        env_class=environments.env_class,
        planning_database=planning_database,
        # Extension-owned.
        excluded_schemas=["topology"],
        prepare_diff=ignore_unmanaged_views,
        authorize=authorize,
        after_change=reload_postgrest_schema,
        source_root=MAPBOARD_ROOT,
    )

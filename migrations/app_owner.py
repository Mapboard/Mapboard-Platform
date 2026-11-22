"""Make `mapboard` the owner of an existing database's application objects.

A fresh build is applied as `mapboard`, but a plan is ownership-blind, so a database
built as another role (the local stack's superuser) is converged here. The role and
its grants come first, from `mapboard schema provision --target grants`.

Shared schemas (`public`, `topology`, PostGIS's tiger geocoder) keep their owners,
apart from the few application objects in `public`. Extension members are left alone.
"""

from macrostrat.database import Database
from macrostrat.schema_management import ApplicationStatus, Migration
from mapboard.core.settings import APP_OWNER

_EXCLUDED = ["information_schema", "public", "topology", "tiger", "tiger_data"]
_INCLUDED = ["public.users", "public.photo_note", "public.context_type"]
_PARAMS = dict(owner=APP_OWNER, excluded=_EXCLUDED, included=_INCLUDED)

_APP_SCHEMA = "n.nspname <> ALL(:excluded) AND n.nspname NOT LIKE 'pg\\_%'"


def _app_object(name: str) -> str:
    return f"(({_APP_SCHEMA}) OR n.nspname || '.' || {name} = ANY(:included))"


def _not_extension_member(catalog: str, oid: str) -> str:
    return (
        "NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend e"
        f" WHERE e.classid = CAST('pg_catalog.{catalog}' AS regclass)"
        f" AND e.objid = {oid} AND e.deptype = 'e')"
    )


# One `ALTER … OWNER TO` per object held by another role, schemas last. Sequences
# owned by a column follow their table.
_REASSIGNMENTS = f"""
SELECT statement FROM (
  SELECT 1 AS stage, 'ALTER '
      || (CASE c.relkind WHEN 'f' THEN 'FOREIGN TABLE'
                         WHEN 'm' THEN 'MATERIALIZED VIEW'
                         ELSE 'TABLE' END)
      || ' ' || quote_ident(n.nspname) || '.' || quote_ident(c.relname)
      || ' OWNER TO ' || quote_ident(:owner) AS statement
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r','p','v','m','S','f') AND {_app_object("c.relname")}
    AND pg_catalog.pg_get_userbyid(c.relowner) <> :owner
    AND {_not_extension_member("pg_class", "c.oid")}
    AND NOT (c.relkind = 'S' AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_depend d
      WHERE d.objid = c.oid AND d.deptype IN ('a','i') AND d.refobjsubid <> 0))
  UNION ALL
  SELECT 2, 'ALTER ' || (CASE WHEN p.prokind = 'a' THEN 'AGGREGATE' ELSE 'ROUTINE' END)
      || ' ' || cast(cast(p.oid AS regprocedure) AS text) || ' OWNER TO ' || quote_ident(:owner)
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE {_APP_SCHEMA} AND pg_catalog.pg_get_userbyid(p.proowner) <> :owner
    AND {_not_extension_member("pg_proc", "p.oid")}
  UNION ALL
  SELECT 3, 'ALTER TYPE ' || quote_ident(n.nspname) || '.' || quote_ident(t.typname)
      || ' OWNER TO ' || quote_ident(:owner)
  FROM pg_catalog.pg_type t
  JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
  WHERE {_app_object("t.typname")} AND pg_catalog.pg_get_userbyid(t.typowner) <> :owner
    AND {_not_extension_member("pg_type", "t.oid")}
    AND (t.typtype IN ('e','d')
         OR (t.typtype = 'c'
             AND EXISTS (SELECT 1 FROM pg_catalog.pg_class rc
                         WHERE rc.oid = t.typrelid AND rc.relkind = 'c')))
  UNION ALL
  SELECT 4, 'ALTER SCHEMA ' || quote_ident(n.nspname) || ' OWNER TO ' || quote_ident(:owner)
  FROM pg_catalog.pg_namespace n
  WHERE {_APP_SCHEMA} AND pg_catalog.pg_get_userbyid(n.nspowner) <> :owner
    AND {_not_extension_member("pg_namespace", "n.oid")}
) s
ORDER BY stage, statement
"""

class AppOwnerMigration(Migration):
    name = "app-owner"
    description = f"Make {APP_OWNER} the owner of what another role built"
    subsystem = "core"
    owner = None  # re-owning another role's objects needs the connector
    load_sql_files = False

    def should_apply(self, db: Database) -> ApplicationStatus:
        if not _role_exists(db):
            return ApplicationStatus.CANT_APPLY
        if db.run_query(_REASSIGNMENTS, _PARAMS).first() is not None:
            return ApplicationStatus.CAN_APPLY
        return ApplicationStatus.APPLIED

    def explain(self, db: Database) -> list[str]:
        return [f"no {APP_OWNER} role: run `mapboard schema provision --target grants`"]

    def apply(self, db: Database):
        statements = [r.statement for r in db.run_query(_REASSIGNMENTS, _PARAMS)]
        db.session.commit()
        print(f"Re-owning {len(statements)} objects to {APP_OWNER}")
        for statement in statements:
            db.run_sql(statement, raise_errors=True)


def _role_exists(db: Database) -> bool:
    return db.run_query(
        "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :owner)", _PARAMS
    ).scalar()

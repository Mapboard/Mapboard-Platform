"""Accounts and project access, read from the core `mapboard` database."""

from macrostrat.auth_system.session import OAuthIdentity, SessionUser
from macrostrat.database import Database

LEVELS = {"read": 1, "edit": 2, "admin": 3}


def allows(access: str | None, needed: str) -> bool:
    return access is not None and LEVELS[access] >= LEVELS[needed]


class MapboardStore:
    def __init__(self, db: Database):
        self.db = db

    def _all(self, sql: str, params: dict) -> list[dict]:
        with self.db.engine.begin() as conn:
            return [dict(r) for r in conn.exec_driver_sql(sql, params).mappings()]

    def _one(self, sql: str, params: dict) -> dict | None:
        rows = self._all(sql, params)
        return rows[0] if rows else None

    # -- UserStore, for the sign-in routes --

    def resolve_user(self, identity: OAuthIdentity) -> SessionUser:
        # Anyone with an ORCID iD gets an account; it grants nothing by itself.
        row = self._one(
            """INSERT INTO public.users (username, sub, name, email)
               VALUES (%(sub)s, %(sub)s, %(name)s, %(email)s)
               ON CONFLICT (sub) DO UPDATE
                 SET name = coalesce(nullif(EXCLUDED.name, ''), users.name),
                     email = coalesce(EXCLUDED.email, users.email)
               RETURNING id, sub, name, is_admin""",
            identity.model_dump(),
        )
        return self._session_user(row)

    def get_user(self, sub: str) -> SessionUser | None:
        row = self._one(
            "SELECT id, sub, name, is_admin FROM public.users WHERE sub = %(sub)s",
            dict(sub=sub),
        )
        return self._session_user(row) if row else None

    @staticmethod
    def _session_user(row: dict) -> SessionUser:
        # `web_user` only: access is decided per project from `sub`, not by role.
        return SessionUser(
            sub=row["sub"],
            name=row["name"] or "",
            role="web_user",
            claims={"admin": row["is_admin"]},
        )

    # -- Access --

    def user_id(self, sub: str | None) -> int | None:
        if sub is None:
            return None
        row = self._one(
            "SELECT id FROM public.users WHERE sub = %(sub)s", dict(sub=sub)
        )
        return row["id"] if row else None

    def is_admin(self, sub: str | None) -> bool:
        if sub is None:
            return False
        row = self._one(
            "SELECT is_admin FROM public.users WHERE sub = %(sub)s", dict(sub=sub)
        )
        return bool(row and row["is_admin"])

    def project_access(self, slug: str, sub: str | None) -> tuple[bool, str | None]:
        """(project exists, access level or None) for a visitor; `sub` None is anonymous."""
        row = self._one(
            """SELECT mapboard.project_access(
                        p.id, (SELECT id FROM public.users WHERE sub = %(sub)s)
                      )::text AS access
               FROM mapboard.project p WHERE p.slug = %(slug)s""",
            dict(slug=slug, sub=sub),
        )
        if row is None:
            return False, None
        return True, row["access"]

    def canvas(self, project_slug: str, context_slug: str | None) -> dict | None:
        """The canvas behind a context, or behind the project's main context."""
        return self._one(
            """SELECT ca.id, ca.slug, ctx.slug AS context_slug
               FROM mapboard.project p
               JOIN mapboard.context ctx
                 ON ctx.project_id = p.id
                AND CASE WHEN %(context)s::text IS NULL THEN ctx.id = p.main_context
                         ELSE ctx.slug = %(context)s END
               JOIN mapboard.canvas ca ON ca.id = ctx.canvas_id
               WHERE p.slug = %(slug)s""",
            dict(slug=project_slug, context=context_slug),
        )

    def project_canvas_ids(self, project_slug: str) -> list[int]:
        rows = self._all(
            """SELECT ca.id FROM mapboard.canvas ca
               JOIN mapboard.project p ON p.id = ca.project_id
               WHERE p.slug = %(slug)s""",
            dict(slug=project_slug),
        )
        return [r["id"] for r in rows]

    def canvas_project_slug(self, canvas_id: int) -> str | None:
        row = self._one(
            """SELECT p.slug FROM mapboard.canvas ca
               JOIN mapboard.project p ON p.id = ca.project_id
               WHERE ca.id = %(id)s""",
            dict(id=canvas_id),
        )
        return row["slug"] if row else None

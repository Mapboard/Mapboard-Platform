"""Manage who may read and edit each project."""

from enum import Enum

from mapboard.core.settings import core_db
from typer import Argument, Exit, Option, Typer

from .application import core_app

app = Typer(name="access", no_args_is_help=True)
console = core_app.console


class Level(str, Enum):
    read = "read"
    edit = "edit"
    admin = "admin"


def _run(sql: str, params: dict):
    with core_db.engine.begin() as conn:
        return conn.exec_driver_sql(sql, params).mappings().all()


def _project_id(slug: str) -> int:
    rows = _run(
        "SELECT id FROM mapboard.project WHERE slug = %(slug)s", dict(slug=slug)
    )
    if not rows:
        console.print(f"[red]No project named [bold]{slug}[/bold]")
        raise Exit(1)
    return rows[0]["id"]


def _user_id(orcid: str) -> int:
    # Accounts can be granted access before their first sign-in.
    rows = _run(
        """INSERT INTO public.users (username, sub) VALUES (%(sub)s, %(sub)s)
           ON CONFLICT (sub) DO UPDATE SET sub = EXCLUDED.sub
           RETURNING id""",
        dict(sub=orcid),
    )
    return rows[0]["id"]


@app.command()
def grant(
    project: str = Argument(..., help="Project slug"),
    orcid: str = Argument(..., help="ORCID iD, e.g. 0000-0002-1825-0097"),
    level: Level = Option(Level.edit, help="Access level"),
):
    """Give a user access to a project"""
    _run(
        """INSERT INTO mapboard.project_member (project_id, user_id, access)
           VALUES (%(project)s, %(user)s, %(level)s::mapboard.access_level)
           ON CONFLICT (project_id, user_id) DO UPDATE SET access = EXCLUDED.access
           RETURNING user_id""",
        dict(project=_project_id(project), user=_user_id(orcid), level=level.value),
    )
    console.print(f"{orcid} now has [bold]{level.value}[/] access to {project}")


@app.command()
def revoke(project: str, orcid: str):
    """Remove a user's access to a project"""
    _run(
        """DELETE FROM mapboard.project_member m USING public.users u
           WHERE m.user_id = u.id AND u.sub = %(sub)s AND m.project_id = %(project)s
           RETURNING m.user_id""",
        dict(project=_project_id(project), sub=orcid),
    )
    console.print(f"{orcid} has no granted access to {project}")


@app.command()
def visibility(
    project: str,
    public: bool = Option(..., "--public/--private", help="Who may view the project"),
):
    """Make a project readable by everyone, or by its members only"""
    _run(
        "UPDATE mapboard.project SET is_public = %(public)s WHERE id = %(id)s RETURNING id",
        dict(id=_project_id(project), public=public),
    )
    console.print(f"{project} is now {'public' if public else 'private'}")


@app.command()
def admin(orcid: str, remove: bool = Option(False, help="Remove administrator status")):
    """Make a user an administrator of every project"""
    _run(
        "UPDATE public.users SET is_admin = %(admin)s WHERE id = %(id)s RETURNING id",
        dict(id=_user_id(orcid), admin=not remove),
    )
    console.print(f"{orcid} is {'no longer' if remove else 'now'} an administrator")


@app.command(name="list")
def list_access(project: str = Argument(None, help="Project slug")):
    """Show each project's visibility and members"""
    rows = _run(
        """SELECT p.slug, p.is_public, u.sub, u.name, m.access::text AS access
           FROM mapboard.project p
           LEFT JOIN mapboard.project_member m ON m.project_id = p.id
           LEFT JOIN public.users u ON u.id = m.user_id
           WHERE %(slug)s::text IS NULL OR p.slug = %(slug)s
           ORDER BY p.slug, m.access DESC, u.sub""",
        dict(slug=project),
    )
    current = None
    for row in rows:
        if row["slug"] != current:
            current = row["slug"]
            label = "public" if row["is_public"] else "private"
            console.print(f"[cyan bold]{current}[/] [dim]({label})[/dim]")
        if row["sub"] is not None:
            console.print(f"  {row['access']:<5} {row['sub']} {row['name'] or ''}")
    for row in _run(
        "SELECT sub, name FROM public.users WHERE is_admin ORDER BY sub", {}
    ):
        console.print(f"[bold]administrator[/] {row['sub']} {row['name'] or ''}")

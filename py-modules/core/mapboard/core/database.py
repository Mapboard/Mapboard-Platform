from macrostrat.database import Database
from mapboard.topology_manager import TopologyContext, TopologyManager, create_context

from .settings import connection_string, core_db


def project_params(project: str):
    """Connection/topology parameters for a project's main canvas.

    Multi-tenant model: ``project -> main_context -> canvas``. All canvases live in the
    single ``mapboard`` database. Raises if the slug isn't a current project (the flat
    legacy ``projects`` table is gone — stale slugs no longer resolve).
    """
    res = core_db.run_query(
        """
        SELECT ca.database, ca.data_schema, ca.topo_schema, ca.srid, ca.tolerance
        FROM mapboard.project p
        JOIN mapboard.context ctx ON ctx.id = p.main_context
        JOIN mapboard.canvas ca ON ca.id = ctx.canvas_id
        WHERE p.slug = :slug
        """,
        dict(slug=project),
    ).one()
    return dict(
        database=res.database,
        data_schema=res.data_schema,
        topo_schema=res.topo_schema,
        srid=res.srid,
        tolerance=res.tolerance,
    )


def setup_database(project: str) -> Database:
    """Legacy/compatibility function for project paramters"""
    mgr = get_topology_manager(project)
    return mgr.database


def get_topology_manager(project: str) -> TopologyManager:
    params = project_params(project)
    db = Database(connection_string(params.pop("database")))
    ctx = create_context(db, **params)
    return TopologyManager(ctx)

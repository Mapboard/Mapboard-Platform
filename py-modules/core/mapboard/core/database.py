from mapboard.topology_manager.database import Database

from .settings import connection_string, core_db


def project_params(project: str):
    """
    Get the database connection parameters for a project
    """
    res = core_db.run_query(
        "SELECT database, data_schema, topo_schema, srid, tolerance FROM projects WHERE slug = :slug",
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
    params = project_params(project)
    db_url = connection_string(params["database"])
    db = Database(db_url)
    db.set_params(env={}, **params)
    return db

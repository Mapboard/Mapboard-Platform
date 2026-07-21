from psycopg2.sql import Identifier, SQL, Literal
from contextlib import contextmanager


def create_foreign_server(db, foreign_db, *, name=None):
    """Create a foreign data wrapper for another database, allowing cross-database queries."""

    foreign_server_name = name
    if foreign_server_name is None:
        foreign_server_name = get_foreign_server_name(foreign_db, prefix="fs")

    # FDW OPTIONS (and DDL generally) cannot take bind parameters — the values must be
    # inlined as literals, so we use psycopg quoting via {..} placeholders, not :binds.
    sql = """
    CREATE EXTENSION IF NOT EXISTS postgres_fdw;

    DROP SERVER IF EXISTS {foreign_server} CASCADE;
    CREATE SERVER IF NOT EXISTS {foreign_server}
      FOREIGN DATA WRAPPER postgres_fdw
      OPTIONS (host {host}, dbname {database}, port {port});

    /** Create a user mapping for the foreign database */
    CREATE USER MAPPING IF NOT EXISTS FOR CURRENT_USER
      SERVER {foreign_server}
      OPTIONS (user {user}, password {password});

    """

    eng = foreign_db.engine

    host = eng.url.host
    port = eng.url.port or 5432
    local_port = db.engine.url.port or 5432
    if host == db.engine.url.host and port == local_port:
        host = "localhost"
        # The internal PG port may differ from the external one, if being run in a docker context
        # Get the port that the current database is running on, locally
        _internal_port = db.run_query(
            "SELECT setting FROM pg_settings WHERE name = 'port'"
        ).scalar()
        port = int(_internal_port)

        if eng.url.database == db.engine.url.database:
            raise ValueError(
                "Foreign database must be different from the current database."
            )

    db.run_sql(
        sql,
        dict(
            foreign_server=Identifier(foreign_server_name),
            host=Literal(host),
            database=Literal(eng.url.database),
            port=Literal(str(port)),
            user=Literal(eng.url.username),
            password=Literal(eng.url.password),
        ),
        raise_on_error=True,
    )

    return foreign_server_name


def drop_foreign_server(db, foreign_server):
    """Drop the foreign server and all associated mappings."""
    sql = """
    DROP SERVER IF EXISTS {foreign_server} CASCADE;
    """
    db.run_sql(
        sql,
        dict(
            foreign_server=Identifier(foreign_server),
        ),
    )


# Yields a temporary foreign server connection


def get_foreign_server_name(foreign_db, *, prefix="fs"):
    """Get a temporary foreign server name that is stable for a given foreign database."""
    uid = str(abs(hash(foreign_db.engine.url)))[0:8]
    foreign_server = f"{prefix}_{uid}_{foreign_db.engine.url.database}"
    return foreign_server


@contextmanager
def foreign_server_connection(db, foreign_db):
    """Context manager to create and drop a temporary foreign server connection."""
    # Get a temporary foreign server name
    foreign_server = get_foreign_server_name(foreign_db, prefix="temp_fs")
    try:
        create_foreign_server(db, foreign_db, name=foreign_server)
        yield foreign_server
    finally:
        drop_foreign_server(db, foreign_server)


def map_foreign_schema(db, foreign_server, target_schema, foreign_schema="public"):
    """Map the foreign schema to the target schema in the current database."""
    args = dict(
        target_schema=Identifier(target_schema),
        foreign_schema=Identifier(foreign_schema),
        foreign_server=Identifier(foreign_server),
    )

    # Cannot run import foreign schema with parameters, so we use Identifiers
    db.run_sql("CREATE SCHEMA IF NOT EXISTS {target_schema}", args, raise_on_error=True)

    sql = "IMPORT FOREIGN SCHEMA {foreign_schema} FROM SERVER {foreign_server} INTO {target_schema}"
    db.run_sql(sql, args, raise_on_error=True)

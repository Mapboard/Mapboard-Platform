from psycopg2.sql import Identifier
from contextlib import contextmanager


def create_foreign_server(db, foreign_db, foreign_server_name):
    """Create a foreign data wrapper for another database, allowing cross-database queries."""

    sql = """
    CREATE EXTENSION IF NOT EXISTS postgres_fdw;

    DROP SERVER IF EXISTS {foreign_server} CASCADE;
    CREATE SERVER IF NOT EXISTS sgp_server
      FOREIGN DATA WRAPPER postgres_fdw
      OPTIONS (host :host, dbname :database, port :port);

    /** Create a user mapping for the SGP database */
    CREATE USER MAPPING IF NOT EXISTS FOR CURRENT_USER
      SERVER {foreign_server}
      OPTIONS (user :user, password :password);

    """

    host = foreign_db.url.host
    port = foreign_db.url.port or 5432
    if host == db.url.host and port == (db.url.port or 5432):
        host = "localhost"
        if foreign_db.url.database == db.url.database:
            raise ValueError(
                "Foreign database must be different from the current database."
            )

    db.run_sql(
        sql,
        dict(
            foreign_server=Identifier(foreign_server_name),
            host=host,
            database=foreign_db.url.database,
            port=str(foreign_db.url.port or 5432),
            user=foreign_db.url.username,
            password=foreign_db.url.password,
        ),
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


@contextmanager
def foreign_server_connection(db, foreign_db):
    """Context manager to create and drop a temporary foreign server connection."""
    # Get a temporary foreign server name
    uid = str(abs(hash(foreign_db.url)))[0:8]
    foreign_server = f"temp_foreign_server_{uid}_{foreign_db.url.database}"
    try:
        create_foreign_server(db, foreign_db, foreign_server)
        yield foreign_server
    finally:
        drop_foreign_server(db, foreign_server)


def map_foreign_schema(db, foreign_server, target_schema, foreign_schema="public"):
    """Map the foreign schema to the target schema in the current database."""

    sql = """
    CREATE SCHEMA IF NOT EXISTS {target_schema};
    IMPORT FOREIGN SCHEMA {foreign_schema} FROM SERVER {foreign_server} INTO {target_schema};
    """

    db.run_sql(
        sql,
        dict(
            target_schema=Identifier(target_schema),
            foreign_schema=Identifier(foreign_schema),
            foreign_server=Identifier(foreign_server),
        ),
    )

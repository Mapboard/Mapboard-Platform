from os import environ


def connection_string(database: str):
    POSTGRES_USER = environ.get("POSTGRES_USER") or "postgres"
    POSTGRES_PASSWORD = environ.get("POSTGRES_PASSWORD") or "postgres"
    MAPBOARD_DB_PORT = environ.get("MAPBOARD_DB_PORT") or 54398
    """Get a connection string for a given database"""
    return f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@localhost:{MAPBOARD_DB_PORT}/{database}"

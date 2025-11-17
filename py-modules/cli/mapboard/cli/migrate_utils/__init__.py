"""
Utilities to migrate the Mapboard database to a single multi-tenant setup
(with multiple data schemas).
"""

from .backup_cluster import pg_dump_cluster


def copy_schema_data(db, source, target, exclude_tables=None, truncate=False):
    """Copy one schema to another within the same database."""

    if exclude_tables is None:
        exclude_tables = []

    # Get list of tables in source schema
    tables = (
        db.run_query(
            """
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = :source_schema
        """,
            dict(source_schema=source),
        )
        .scalars()
        .all()
    )

    for table in tables:
        if table in exclude_tables:
            continue

        sql = f"""
        INSERT INTO {target}.{table} (SELECT * FROM {source}.{table});
        """
        db.run_sql(sql)

from psycopg2.sql import Identifier, SQL, Placeholder


def insert_values(db, table: Identifier, values: dict, returning=None):
    """Helper for importing arbitrary values into tables."""

    column_names = values.keys()
    column_list = SQL(", ").join([Identifier(col) for col in column_names])
    value_placeholders = SQL(", ").join([Placeholder(col) for col in column_names])

    sql = SQL("INSERT INTO {table} ({columns}) VALUES ({values})").format(
        table=table,
        columns=column_list,
        values=value_placeholders,
    )
    if returning is not None:
        sql += SQL(" RETURNING ") + Identifier(returning)

    return db.run_query(sql, values)

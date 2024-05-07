import asyncio
from contextvars import ContextVar
from json import loads

from macrostrat.app_frame.compose import console
from mapboard.topology_manager.commands.update import _update
from mapboard.topology_manager.database import Database
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

from .database import core_db

verbose = True


update_in_progress = ContextVar("update_in_progress", default=False)
needs_update = ContextVar("needs_update", default=set())
clients = ContextVar("clients", default={})

from .database import connection_string


def project_params(data_schema: str):
    res = core_db.run_query(
        "SELECT database, data_schema, topo_schema, srid, tolerance FROM projects WHERE data_schema = :data_schema",
        dict(data_schema=data_schema),
    ).one()
    return dict(
        database=res.database,
        data_schema=res.data_schema,
        topo_schema=res.topo_schema,
        srid=res.srid,
        tolerance=res.tolerance,
    )


def get_client(database: str, data_schema: str) -> Database:
    _clients = clients.get()
    client = _clients.get(data_schema, None)
    if client is not None:
        return client

    # Setup client
    params = project_params(data_schema)
    assert params["database"] == database
    DATABASE_URL = connection_string(database)
    db = Database(DATABASE_URL)
    db.set_params(env={}, **params)

    _clients[data_schema] = db
    clients.set(_clients)

    return db


def watch(database: str):
    """Watch a database for topology changes.

    Unlike the core watcher in
    mapboard.topology_manager, this works across multiple projects,
    if they share the same database.
    """
    DATABASE_URL = connection_string(database)
    main_db = Database(DATABASE_URL)

    def _update_topology(database):
        status = needs_update.get()

        if len(status) == 0:
            return
        if update_in_progress.get():
            return

        print("Updating topology", status)

        update_in_progress.set(True)
        next_schema = status.pop()
        needs_update.set(status)

        print(f"Updating topology for {next_schema}")
        # Do the update
        db = get_client(database, next_schema)
        print(f"Updating topology for {next_schema}", db)
        _update(db)
        update_in_progress.set(False)

    conn = main_db.engine.connect()
    # Get a raw connection to listen for notifications
    conn = conn.connection
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)

    cursor = conn.cursor()
    cursor.execute("LISTEN events;")

    def handle_notify():
        conn.poll()
        for notify in conn.notifies:
            json_payload = loads(notify.payload)
            schema = json_payload.get("schema")

            print(json_payload)

            status = needs_update.get()
            status.add(schema)
            needs_update.set(status)
            # We can do this async eventually, hopefully.
            _update_topology(database)
            if len(needs_update.get()) > 0:
                _update_topology(database)
        conn.notifies.clear()

    console.print(f"Watching database {database} for topology changes...")
    loop = asyncio.get_event_loop()
    loop.add_reader(conn, handle_notify)
    loop.run_forever()

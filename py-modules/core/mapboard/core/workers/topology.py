"""
Worker that continuously checks for new topology tasks and
sends them to the broker for processing.
"""
import asyncio
from contextvars import ContextVar
from datetime import datetime
from json import loads

from mapboard.topology_manager.commands.update import _update
from mapboard.topology_manager.database import Database
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from datetime import datetime

from mapboard.core.settings import core_db, connection_string
from json import dumps

verbose = True

update_in_progress = ContextVar("update_in_progress", default=False)
needs_update = ContextVar("needs_update", default=set())
clients = ContextVar("clients", default={})


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


def watch_topology(database: str):
    """Watch database(s) for topology changes.

    Unlike the core watcher in
    mapboard.topology_manager, this works across multiple projects,
    if they share the same database.
    """
    DATABASE_URL = connection_string(database)
    main_db = Database(DATABASE_URL)

    # Get a raw connection to listen for notifications
    conn = _raw_connection(main_db)
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)

    cursor = conn.cursor()
    cursor.execute("LISTEN events;")

    def handle_notify():
        conn.poll()
        for notify in conn.notifies:
            json_payload = loads(notify.payload)

            type = json_payload.get("type", None)
            if type == "test":
                print("Received test event", json_payload)
                continue

            schema = json_payload.get("schema")

            status = needs_update.get()
            status.add(schema)
            needs_update.set(status)
            # We can do this async eventually, hopefully.
            # _update_topology(database)
            # if len(needs_update.get()) > 0:
            #     _update_topology(database)
        conn.notifies.clear()

    print(f"Watching database {database} for topology changes...")
    loop = asyncio.get_event_loop()

    loop.add_reader(conn, handle_notify)
    loop.create_task(update_topology_sequentially(database))

    loop.run_forever()


async def update_topology_sequentially(database: str):
    """Check for topology updates and run them sequentially"""
    while True:
        await _update_topology(database)


def _raw_connection(database: Database):
    conn = database.engine.connect()
    return conn.connection


async def _update_topology(database):
    status = needs_update.get()

    if len(status) == 0 or update_in_progress.get():
        await asyncio.sleep(1)
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


def send_event(database: str):
    """Send an event to the database for testing purposes"""
    url = connection_string(database)
    db = Database(url)
    conn = _raw_connection(db)
    cursor = conn.cursor()
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    test_event = dict(
        type="test",
        time=datetime.now().isoformat(),
    )
    test_event = dumps(test_event)

    cursor.execute("NOTIFY events, %s;", (test_event,))
    print(f"Sent {test_event} to {database}")

"""Request a topology rebuild: write the ledger row, then hand its id to the broker."""

from macrostrat.database import Database

from . import ledger
from .app import TOPOLOGY_REBUILD, app


def request_topology_rebuild(
    db: Database, canvas_id: int, params: dict, requested_by: int | None = None
) -> dict:
    """Queue a rebuild. Raises `ledger.RunInProgress` if the canvas is busy."""
    run = ledger.create_run(db, TOPOLOGY_REBUILD, canvas_id, params, requested_by)
    try:
        # By name, so the caller never imports the topology code.
        result = app.send_task(TOPOLOGY_REBUILD, [str(run["id"])])
    except Exception as err:
        ledger.fail_run(db, run["id"], f"Could not reach the task broker: {err}")
        raise
    ledger.set_celery_task(db, run["id"], result.id)
    return run

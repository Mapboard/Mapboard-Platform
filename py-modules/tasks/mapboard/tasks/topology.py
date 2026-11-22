import sys
import traceback
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from time import monotonic

from macrostrat.database import Database
from pydantic import BaseModel

from . import ledger
from .app import TOPOLOGY_REBUILD, app

LOG_FLUSH_SECONDS = 5


class RebuildParams(BaseModel):
    # Discard all map faces and rebuild them, rather than only the dirty ones.
    reset: bool = True
    fix_failed: bool = False
    composite_layers: bool = False


class RunLog(StringIO):
    """Captures the topology manager's console output and saves it as it grows."""

    def __init__(self, db: Database, run_id: str):
        super().__init__()
        self.db = db
        self.run_id = run_id
        self.flushed_at = monotonic()

    def write(self, text: str) -> int:
        sys.__stdout__.write(text)
        n = super().write(text)
        if monotonic() - self.flushed_at > LOG_FLUSH_SECONDS:
            self.flushed_at = monotonic()
            ledger.write_log(self.db, self.run_id, self.getvalue())
        return n


def run_topology_rebuild(db: Database, run_id: str, get_manager=None) -> str:
    """Execute a queued rebuild and record its outcome. Returns the final state."""
    run = ledger.start_run(db, run_id)
    if run is None:
        return "skipped"

    if get_manager is None:
        from mapboard.core.database import canvas_topology_manager as get_manager

    params = RebuildParams(**run["params"])
    log = RunLog(db, run_id)
    error = None
    try:
        with redirect_stdout(log), redirect_stderr(log):
            mgr = get_manager(run["canvas_id"])
            mgr.update(**params.model_dump())
    except Exception:
        error = traceback.format_exc()
    ledger.finish_run(db, run_id, error=error, log=log.getvalue())
    return "succeeded" if error is None else "failed"


@app.task(name=TOPOLOGY_REBUILD)
def rebuild_topology(run_id: str) -> str:
    from mapboard.core.settings import core_db

    return run_topology_rebuild(core_db, run_id)

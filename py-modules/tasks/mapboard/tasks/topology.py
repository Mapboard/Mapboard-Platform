import sys
import traceback
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from time import monotonic

from macrostrat.database import Database
from pydantic import BaseModel

from . import ledger
from .app import BROKER_URL, TOPOLOGY_REBUILD, app

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


def run_topology_rebuild(
    db: Database, run_id: str, get_manager=None, *, db_url=None, redis_url=None
) -> str:
    """Execute a queued rebuild and record its outcome. Returns the final state.

    With `redis_url`, as on the worker, the output streams to the browser and a
    cancel stops it; without, it runs here and Ctrl-C stops it.
    """
    run = ledger.start_run(db, run_id)
    if run is None:
        return "skipped"

    try:
        state, error, log = _rebuild(db, run, get_manager, db_url, redis_url)
    except BaseException as err:
        # Otherwise the run stays 'running' and its page waits forever.
        ledger.end_live_run(
            db,
            run_id,
            state="failed",
            error=f"{type(err).__name__}: {err}",
            log=traceback.format_exc(),
        )
        raise
    ledger.finish_run(db, run_id, state=state, error=error, log=log)
    return state


def _rebuild(db, run, get_manager, db_url, redis_url) -> tuple[str, str | None, str]:
    params = RebuildParams(**run["params"])

    def rebuild(*_):
        # Imported here so an import error lands in the run's output.
        manager = get_manager
        if manager is None:
            from mapboard.core.database import canvas_topology_manager as manager
        manager(run["canvas_id"]).update(**params.model_dump())

    if redis_url is None:
        return _run_here(db, run["id"], rebuild)

    from macrostrat.task_runner import execute

    outcome = execute(str(run["id"]), rebuild, db_url=db_url, redis_url=redis_url)
    return outcome.state, outcome.error, outcome.log


def _run_here(db: Database, run_id: str, rebuild) -> tuple[str, str | None, str]:
    log = RunLog(db, run_id)
    try:
        with redirect_stdout(log), redirect_stderr(log):
            rebuild()
    except KeyboardInterrupt:
        return "cancelled", None, log.getvalue()
    except Exception:
        return "failed", traceback.format_exc(), log.getvalue()
    return "succeeded", None, log.getvalue()


@app.task(name=TOPOLOGY_REBUILD)
def rebuild_topology(run_id: str) -> str:
    from mapboard.core.settings import core_db, database_url

    return run_topology_rebuild(
        core_db, run_id, db_url=database_url(), redis_url=BROKER_URL
    )

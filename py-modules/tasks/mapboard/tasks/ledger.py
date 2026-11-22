"""The `mapboard.task_run` ledger: one row per requested run, in Postgres.

The broker only carries a run's id; the row is the record of state, so a run
survives a broker restart and a second request for a busy canvas is refused.
"""

from json import dumps
from uuid import UUID

from macrostrat.database import Database
from sqlalchemy.exc import IntegrityError

LIVE_STATES = ("queued", "running")
RUN_COLUMNS = """id, task, canvas_id, params, requested_by, state,
                 created_at, started_at, finished_at, error"""


class RunInProgress(Exception):
    """A run of this task is already queued or running for the canvas."""


def _one(db: Database, sql: str, params: dict):
    with db.engine.begin() as conn:
        return conn.exec_driver_sql(sql, params).mappings().one_or_none()


def create_run(
    db: Database, task: str, canvas_id: int, params: dict, requested_by: int | None
) -> dict:
    try:
        return dict(
            _one(
                db,
                f"""INSERT INTO mapboard.task_run (task, canvas_id, params, requested_by)
                    VALUES (%(task)s, %(canvas_id)s, %(params)s::jsonb, %(requested_by)s)
                    RETURNING {RUN_COLUMNS}""",
                dict(
                    task=task,
                    canvas_id=canvas_id,
                    params=dumps(params),
                    requested_by=requested_by,
                ),
            )
        )
    except IntegrityError as err:
        if "task_run_live_idx" in str(err):
            raise RunInProgress(task, canvas_id) from err
        raise


def set_celery_task(db: Database, run_id: UUID | str, celery_task_id: str):
    _one(
        db,
        "UPDATE mapboard.task_run SET celery_task_id = %(tid)s WHERE id = %(id)s RETURNING id",
        dict(id=str(run_id), tid=celery_task_id),
    )


def start_run(db: Database, run_id: UUID | str) -> dict | None:
    """Claim a queued run. None if it is gone or already claimed."""
    row = _one(
        db,
        f"""UPDATE mapboard.task_run SET state = 'running', started_at = now()
            WHERE id = %(id)s AND state = 'queued'
            RETURNING {RUN_COLUMNS}""",
        dict(id=str(run_id)),
    )
    return dict(row) if row else None


def write_log(db: Database, run_id: UUID | str, log: str):
    _one(
        db,
        "UPDATE mapboard.task_run SET log = %(log)s WHERE id = %(id)s RETURNING id",
        dict(id=str(run_id), log=log),
    )


def finish_run(db: Database, run_id: UUID | str, *, error: str | None, log: str):
    state = "succeeded" if error is None else "failed"
    _one(
        db,
        """UPDATE mapboard.task_run
           SET state = %(state)s, finished_at = now(), error = %(error)s, log = %(log)s
           WHERE id = %(id)s RETURNING id""",
        dict(id=str(run_id), state=state, error=error, log=log),
    )


def fail_run(db: Database, run_id: UUID | str, error: str):
    """Close a run that never reached the worker."""
    _one(
        db,
        """UPDATE mapboard.task_run SET state = 'failed', finished_at = now(), error = %(error)s
           WHERE id = %(id)s AND state IN ('queued', 'running') RETURNING id""",
        dict(id=str(run_id), error=error),
    )


def fail_orphaned_runs(db: Database, task_prefix: str) -> int:
    """Close runs left `running` by a worker that died; they would block new ones."""
    with db.engine.begin() as conn:
        res = conn.exec_driver_sql(
            """UPDATE mapboard.task_run
               SET state = 'failed', finished_at = now(), error = 'Worker restarted during the run'
               WHERE state = 'running' AND task LIKE %(prefix)s""",
            dict(prefix=task_prefix + "%"),
        )
        return res.rowcount


def get_run(db: Database, run_id: UUID | str, *, with_log: bool = False) -> dict | None:
    columns = RUN_COLUMNS + (", log" if with_log else "")
    row = _one(
        db,
        f"SELECT {columns} FROM mapboard.task_run WHERE id = %(id)s",
        dict(id=str(run_id)),
    )
    return dict(row) if row else None


def list_runs(db: Database, canvas_ids: list[int], limit: int = 20) -> list[dict]:
    with db.engine.begin() as conn:
        rows = conn.exec_driver_sql(
            f"""SELECT {RUN_COLUMNS} FROM mapboard.task_run
                WHERE canvas_id = ANY(%(ids)s)
                ORDER BY created_at DESC LIMIT %(limit)s""",
            dict(ids=canvas_ids, limit=limit),
        )
        return [dict(r) for r in rows.mappings()]

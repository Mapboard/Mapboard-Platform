from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from macrostrat.auth_system.session import SessionData, SessionReader
from macrostrat.task_runner import SSE_HEADERS, output_events, read_all, request_cancel
from mapboard.tasks import ledger
from mapboard.tasks.app import BROKER_URL
from mapboard.tasks.app import app as celery_app
from mapboard.tasks.enqueue import request_topology_rebuild
from redis import Redis
from redis.asyncio import Redis as AsyncRedis
from mapboard.tasks.topology import RebuildParams
from starlette.concurrency import run_in_threadpool

from .store import MapboardStore, allows


class RebuildRequest(RebuildParams):
    # Defaults to the project's main context.
    context: str | None = None


def create_tasks_router(store: MapboardStore, reader: SessionReader) -> APIRouter:
    router = APIRouter(prefix="/tasks", tags=["tasks"])
    db = store.db

    def require(project: str, session: SessionData | None, needed: str):
        sub = session.sub if session else None
        exists, access = store.project_access(project, sub)
        if allows(access, needed):
            return
        if sub is None:
            raise HTTPException(401, "Sign in to continue")
        if not exists or access is None:
            raise HTTPException(404, "Project not found")
        raise HTTPException(403, "You do not have edit access to this project")

    def start(project: str, body: RebuildRequest, session: SessionData | None):
        require(project, session, "edit")
        canvas = store.canvas(project, body.context)
        if canvas is None:
            raise HTTPException(404, "Context not found")
        params = body.model_dump(exclude={"context"})
        try:
            return request_topology_rebuild(
                db, canvas["id"], params, store.user_id(session.sub)
            )
        except ledger.RunInProgress:
            raise HTTPException(409, "A rebuild of this topology is already under way")
        except Exception as err:
            raise HTTPException(503, f"Could not queue the rebuild: {err}")

    @router.post("/topology/{project}", status_code=202)
    async def rebuild_topology(
        project: str, body: RebuildRequest, session=Depends(reader)
    ):
        """Queue a topology rebuild for one of the project's canvases."""
        return await run_in_threadpool(start, project, body, session)

    def runs(project: str, session: SessionData | None):
        require(project, session, "read")
        return ledger.list_runs(db, store.project_canvas_ids(project))

    @router.get("/topology/{project}")
    async def list_topology_runs(project: str, session=Depends(reader)):
        return await run_in_threadpool(runs, project, session)

    def run(run_id: UUID, session: SessionData | None, needed: str = "read"):
        row = ledger.get_run(db, run_id, with_log=True)
        if row is None:
            raise HTTPException(404, "Run not found")
        require(store.canvas_project_slug(row["canvas_id"]), session, needed)
        return row

    @router.get("/runs/{run_id}")
    async def get_run(run_id: UUID, session=Depends(reader)):
        return await run_in_threadpool(run, run_id, session)

    def cancel(run_id: UUID, session: SessionData | None):
        row = run(run_id, session, "edit")
        if row["state"] == "queued":
            # No worker has it, so nothing else will record the cancel.
            if row["celery_task_id"]:
                celery_app.control.revoke(row["celery_task_id"])
            ledger.end_live_run(
                db, run_id, state="cancelled", error=f"Cancelled by {session.sub}"
            )
        elif row["state"] == "running":
            if request_cancel(Redis.from_url(BROKER_URL), str(run_id)) == 0:
                raise HTTPException(409, "No worker is running it; kill it instead")
        else:
            raise HTTPException(409, f"The run is already {row['state']}")
        return ledger.get_run(db, run_id)

    @router.post("/runs/{run_id}/cancel")
    async def cancel_run(run_id: UUID, session=Depends(reader)):
        """Stop a run the way Ctrl-C would; the worker records the outcome."""
        return await run_in_threadpool(cancel, run_id, session)

    def kill(run_id: UUID, session: SessionData | None):
        row = run(run_id, session, "edit")
        if row["state"] not in ledger.LIVE_STATES:
            raise HTTPException(409, f"The run is already {row['state']}")
        if row["celery_task_id"]:
            celery_app.control.revoke(
                row["celery_task_id"], terminate=True, signal="SIGKILL"
            )
        # The process is gone before it can record anything.
        log = read_all(Redis.from_url(BROKER_URL), str(run_id)) or None
        ledger.end_live_run(
            db, run_id, state="killed", error=f"Killed by {session.sub}", log=log
        )
        return ledger.get_run(db, run_id)

    @router.post("/runs/{run_id}/kill")
    async def kill_run(run_id: UUID, session=Depends(reader)):
        """End the worker process of a run that will not stop."""
        return await run_in_threadpool(kill, run_id, session)

    @router.get("/runs/{run_id}/output")
    async def run_output(
        run_id: UUID,
        request: Request,
        since: str | None = None,
        session=Depends(reader),
    ):
        """The run's terminal output as Server-Sent Events."""
        await run_in_threadpool(run, run_id, session)

        async def state():
            return await run_in_threadpool(ledger.get_state, db, run_id)

        async def archived_log():
            return await run_in_threadpool(ledger.get_log, db, run_id)

        async def events():
            redis = AsyncRedis.from_url(BROKER_URL)
            try:
                async for event in output_events(
                    redis,
                    str(run_id),
                    state=state,
                    archived_log=archived_log,
                    since=request.headers.get("last-event-id") or since or "0-0",
                    disconnected=request.is_disconnected,
                ):
                    yield event
            finally:
                await redis.aclose()

        return StreamingResponse(
            events(), media_type="text/event-stream", headers=SSE_HEADERS
        )

    return router

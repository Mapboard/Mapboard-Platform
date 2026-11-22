from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from macrostrat.auth_system.session import SessionData, SessionReader
from mapboard.tasks import ledger
from mapboard.tasks.enqueue import request_topology_rebuild
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

    def run(run_id: UUID, session: SessionData | None):
        row = ledger.get_run(db, run_id, with_log=True)
        if row is None:
            raise HTTPException(404, "Run not found")
        require(store.canvas_project_slug(row["canvas_id"]), session, "read")
        return row

    @router.get("/runs/{run_id}")
    async def get_run(run_id: UUID, session=Depends(reader)):
        return await run_in_threadpool(run, run_id, session)

    return router

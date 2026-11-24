"""Queue and inspect background topology rebuilds."""

from time import sleep

from mapboard.core.settings import core_db
from typer import Argument, Exit, Option, Typer

from .application import core_app

app = Typer(name="tasks", no_args_is_help=True)
console = core_app.console


def _canvas(project: str, context: str | None) -> dict:
    from mapboard.api.store import MapboardStore

    canvas = MapboardStore(core_db).canvas(project, context)
    if canvas is None:
        console.print(f"[red]No such project or context: {project} {context or ''}")
        raise Exit(1)
    return canvas


@app.command(name="rebuild-topology")
def rebuild_topology(
    project: str = Argument(..., help="Project slug"),
    context: str = Option(None, help="Context slug; defaults to the main context"),
    reset: bool = Option(True, help="Rebuild every face, not only the dirty ones"),
    fix_failed: bool = Option(False, help="Retry lines that failed before"),
    composite_layers: bool = Option(False, help="Also rebuild composite layers"),
    local: bool = Option(False, help="Run in this process instead of the worker"),
    wait: bool = Option(False, help="Wait for the worker to finish"),
):
    """Rebuild a project's topology on the background worker"""
    from mapboard.tasks import ledger
    from mapboard.tasks.app import TOPOLOGY_REBUILD
    from mapboard.tasks.enqueue import request_topology_rebuild
    from mapboard.tasks.topology import run_topology_rebuild

    canvas = _canvas(project, context)
    params = dict(reset=reset, fix_failed=fix_failed, composite_layers=composite_layers)
    try:
        if local:
            run = ledger.create_run(
                core_db, TOPOLOGY_REBUILD, canvas["id"], params, None
            )
        else:
            run = request_topology_rebuild(core_db, canvas["id"], params)
    except ledger.RunInProgress:
        console.print("[red]A rebuild of this topology is already under way")
        raise Exit(1)
    console.print(f"Run [bold]{run['id']}[/] queued")

    if local:
        state = run_topology_rebuild(core_db, str(run["id"]))
    elif wait:
        state = "queued"
        while state in ledger.LIVE_STATES:
            sleep(2)
            state = ledger.get_run(core_db, run["id"])["state"]
    else:
        return
    console.print(f"Run {state}")
    if state != "succeeded":
        console.print(ledger.get_run(core_db, run["id"])["error"] or "")
        raise Exit(1)


@app.command()
def runs(project: str = Argument(..., help="Project slug")):
    """List recent topology runs for a project"""
    from mapboard.api.store import MapboardStore
    from mapboard.tasks import ledger

    ids = MapboardStore(core_db).project_canvas_ids(project)
    for run in ledger.list_runs(core_db, ids):
        when = run["created_at"].strftime("%Y-%m-%d %H:%M")
        console.print(f"{when}  {run['state']:<10} {run['id']}  {run['params']}")

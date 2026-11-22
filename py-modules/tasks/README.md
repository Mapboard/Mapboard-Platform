# Mapboard Task System

Background tasks for Mapboard, run by a Celery worker with a Redis queue. The
one task so far is `mapboard.topology.rebuild`, which replaces the
`topo update --watch` process.

- `ledger.py` — `mapboard.task_run`, one row per requested run. The row is the
  record of state; Redis only carries the run's id. A partial unique index
  allows one queued or running rebuild per canvas.
- `enqueue.py` — `request_topology_rebuild`, used by the API and the CLI.
- `topology.py` — the task. It runs `TopologyManager.update` for the run's
  canvas and saves the console output to the ledger as it goes.
- `app.py` — the Celery app. Runs left `running` by a dead worker are closed
  when a worker starts.

Worker: `celery -A mapboard.tasks.app worker -Q topology --concurrency=1 --max-tasks-per-child=1`.
A fresh process per run keeps the topology manager's per-process state from
leaking between canvases.

From the CLI: `mapboard tasks rebuild-topology <project>` (`--local` runs it in
the calling process, still recorded in the ledger) and `mapboard tasks runs <project>`.

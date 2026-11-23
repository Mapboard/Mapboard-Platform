/** Ledger of background task runs (topology rebuilds), read by the API and written by the worker. */

CREATE TABLE IF NOT EXISTS mapboard.task_run (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task           text NOT NULL,
  canvas_id      integer REFERENCES mapboard.canvas (id) ON DELETE CASCADE,
  params         jsonb NOT NULL DEFAULT '{}',
  requested_by   integer REFERENCES public.users (id) ON DELETE SET NULL,
  celery_task_id text,
  state          text NOT NULL DEFAULT 'queued'
                   CHECK (state IN ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'killed')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  started_at     timestamptz,
  finished_at    timestamptz,
  error          text,
  log            text
);

-- One live run per task and canvas: two rebuilds of one topology would deadlock.
CREATE UNIQUE INDEX IF NOT EXISTS task_run_live_idx
  ON mapboard.task_run (task, canvas_id)
  WHERE state IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS task_run_canvas_idx ON mapboard.task_run (canvas_id, created_at DESC);

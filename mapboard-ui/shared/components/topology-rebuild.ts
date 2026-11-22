import h from "@macrostrat/hyper";
import { Button, Tag } from "@blueprintjs/core";
import type { Intent } from "@blueprintjs/core";
import { useCallback, useEffect, useState } from "react";
import { apiDomain } from "~/settings";
import { canEdit, useProjectAccess } from "~/utils/auth";

interface TaskRun {
  id: string;
  state: "queued" | "running" | "succeeded" | "failed";
  created_at: string;
  finished_at: string | null;
  error: string | null;
}

const stateIntent: Record<TaskRun["state"], Intent> = {
  queued: "none",
  running: "primary",
  succeeded: "success",
  failed: "danger",
};

const POLL_INTERVAL = 3000;

function isLive(run: TaskRun | null): boolean {
  return run?.state === "queued" || run?.state === "running";
}

/** Rebuilds a project's topology on the background worker. Editors only. */
export function TopologyRebuild({ project }: { project: string }) {
  const access = useProjectAccess(project);
  const [latest, setLatest] = useState<TaskRun | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const url = `${apiDomain}/api/tasks/topology/${project}`;
  const editor = canEdit(access);

  const refresh = useCallback(async () => {
    const res = await fetch(url);
    if (!res.ok) {
      return;
    }
    const runs: TaskRun[] = await res.json();
    setLatest(runs[0] ?? null);
  }, [url]);

  useEffect(() => {
    if (editor) {
      refresh();
    }
  }, [editor, refresh]);

  const live = isLive(latest);
  useEffect(() => {
    if (!live) {
      return;
    }
    const timer = setInterval(refresh, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [live, refresh]);

  if (!editor) {
    return null;
  }

  async function start() {
    setMessage(null);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reset: true }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setMessage(body?.detail ?? "Could not start the rebuild");
    }
    refresh();
  }

  let status = null;
  if (latest != null) {
    const when = new Date(latest.finished_at ?? latest.created_at);
    status = h("span.latest-run", [
      h(Tag, { minimal: true, intent: stateIntent[latest.state] }, latest.state),
      " ",
      when.toLocaleString(),
    ]);
  }

  let errorMessage = message;
  if (errorMessage == null && latest?.state === "failed") {
    errorMessage = latest.error?.trim().split("\n").pop() ?? null;
  }

  return h("div.topology-rebuild", [
    h("h2", "Topology"),
    h("p", [
      h(
        Button,
        { icon: "refresh", disabled: live, loading: live, onClick: start },
        "Rebuild topology",
      ),
      " ",
      status,
    ]),
    h.if(errorMessage != null)("p.error", errorMessage),
  ]);
}

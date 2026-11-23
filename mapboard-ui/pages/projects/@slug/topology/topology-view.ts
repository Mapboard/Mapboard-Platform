/** Topology rebuilds for a project: options and Run above the shown run's
 * terminal, with recent runs alongside. A run's page shows that run; the
 * project's page shows the latest. */
import hyper from "@macrostrat/hyper";
import {
  Button,
  Callout,
  Card,
  HTMLSelect,
  Intent,
  Switch,
  Tag,
} from "@blueprintjs/core";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useData } from "vike-react/useData";
import { navigate } from "vike/client/router";
import { RunTerminal } from "~/components/run-terminal";
import { canEdit, useProjectAccess } from "~/utils/auth";
import {
  cancelRun,
  defaultRebuildParams,
  fetchRun,
  fetchRuns,
  isLive,
  killRun,
  type RebuildParams,
  type RunState,
  startRebuild,
  type TaskRun,
  topologyPageURL,
} from "~/utils/tasks";
import type { ContextOption, Data } from "./+data";
import styles from "./topology.module.sass";

const h = hyper.styled(styles);

const POLL_INTERVAL = 3000;

const stateIntent: Record<RunState, Intent> = {
  queued: Intent.NONE,
  running: Intent.PRIMARY,
  succeeded: Intent.SUCCESS,
  failed: Intent.DANGER,
  cancelled: Intent.WARNING,
  killed: Intent.DANGER,
};

export function TopologyView({
  project,
  runId,
}: {
  project: string;
  runId: string | null;
}) {
  const { title, contexts } = useData<Data>();
  const access = useProjectAccess(project);
  const { runs, refresh: refreshRuns } = useRuns(project);

  let shownId = runId;
  if (shownId == null) {
    shownId = runs?.[0]?.id ?? null;
  }
  const { run, error, refresh: refreshRun } = useRun(shownId);

  const refresh = useCallback(() => {
    refreshRuns();
    refreshRun();
  }, [refreshRuns, refreshRun]);

  let output: ReactNode = null;
  if (error != null) {
    output = h(Callout, { intent: Intent.DANGER }, error);
  } else if (run != null) {
    output = h("div.run-output", [
      h(RunOutcome, { run }),
      h(RunTerminal, { runId: run.id, onEnd: refresh }),
    ]);
  } else if (runs != null) {
    output = h("p.muted", "No rebuilds yet. The output of a run appears here.");
  }

  return h("div.topology-page", [
    h("p.breadcrumbs", [
      h("a", { href: `/projects/${project}` }, title),
      " / Topology",
    ]),
    h("h1", "Topology"),
    h("div.layout", [
      h("div.main", [
        h(RebuildPanel, {
          project,
          contexts,
          run,
          editor: canEdit(access),
          onChange: refresh,
        }),
        output,
      ]),
      h(RunList, { project, runs, contexts, shownId }),
    ]),
  ]);
}

function useRuns(project: string) {
  const [runs, setRuns] = useState<TaskRun[] | null>(null);
  const refresh = useCallback(() => {
    fetchRuns(project)
      .then(setRuns)
      .catch(() => setRuns([]));
  }, [project]);
  useEffect(refresh, [refresh]);
  return { runs, refresh };
}

function useRun(runId: string | null) {
  const [run, setRun] = useState<TaskRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => {
    if (runId == null) {
      setRun(null);
      return;
    }
    fetchRun(runId)
      .then((r) => {
        setRun(r);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [runId]);
  const live = isLive(run);
  useEffect(() => {
    refresh();
    if (!live) {
      return;
    }
    // The stream ends with the run; polling catches queued → running.
    const timer = setInterval(refresh, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [refresh, live]);
  return { run, error, refresh };
}

function RebuildPanel({
  project,
  contexts,
  run,
  editor,
  onChange,
}: {
  project: string;
  contexts: ContextOption[];
  run: TaskRun | null;
  editor: boolean;
  onChange(): void;
}) {
  const main = contexts.find((c) => c.is_main) ?? contexts[0];
  const [context, setContext] = useState(main?.slug ?? null);
  const [params, setParams] = useState<RebuildParams>(defaultRebuildParams);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const started = await startRebuild(project, context, params);
      navigate(topologyPageURL(project, started));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function option(key: keyof RebuildParams, label: string) {
    return h(Switch, {
      label,
      checked: params[key],
      disabled: !editor,
      onChange: () => setParams({ ...params, [key]: !params[key] }),
    });
  }

  let errorNode: ReactNode = null;
  if (error != null) {
    errorNode = h(Callout, { intent: Intent.DANGER }, error);
  }

  let runButton: ReactNode = h(
    "p.muted",
    "Editors of this project can rebuild its topology.",
  );
  if (editor) {
    runButton = h(
      Button,
      {
        icon: "play",
        intent: Intent.PRIMARY,
        loading: busy,
        disabled: isLive(run),
        onClick: submit,
      },
      "Rebuild",
    );
  }

  return h(Card, { className: "rebuild-panel" }, [
    h("label.context-select", [
      "Context ",
      h(HTMLSelect, {
        value: context ?? undefined,
        disabled: !editor,
        onChange: (e) => setContext(e.target.value),
        options: contexts.map((c) => ({ value: c.slug, label: c.name })),
      }),
    ]),
    option("reset", "Rebuild every face, not only those whose lines changed"),
    option("fix_failed", "Retry lines that failed before"),
    option("composite_layers", "Also rebuild composite layers"),
    errorNode,
    h("div.panel-footer", [
      runButton,
      h(RunStatus, { run, editor, onChange }),
    ]),
  ]);
}

function RunStatus({
  run,
  editor,
  onChange,
}: {
  run: TaskRun | null;
  editor: boolean;
  onChange(): void;
}) {
  const live = isLive(run);
  const now = useNow(live);
  if (run == null) {
    return null;
  }

  let actions: ReactNode = null;
  if (live && editor) {
    actions = h("div.run-actions", [
      h(RunAction, {
        label: "Cancel",
        icon: "stop",
        action: () => cancelRun(run.id),
        onDone: onChange,
      }),
      h(RunAction, {
        label: "Kill",
        icon: "cross",
        intent: Intent.DANGER,
        confirm: "Kill the worker process? Cancel first if it responds.",
        action: () => killRun(run.id),
        onDone: onChange,
      }),
    ]);
  }

  const details = [
    new Date(run.started_at ?? run.created_at).toLocaleString(),
    elapsed(run, now),
  ].filter(Boolean);

  return h("div.run-status", [
    h(StateTag, { state: run.state }),
    h("span.muted.run-details", details.join(" · ")),
    actions,
  ]);
}

function RunAction({
  label,
  icon,
  intent,
  confirm,
  action,
  onDone,
}: {
  label: string;
  icon: "stop" | "cross";
  intent?: Intent;
  confirm?: string;
  action(): Promise<TaskRun>;
  onDone(): void;
}) {
  const [busy, setBusy] = useState(false);
  async function click() {
    if (confirm != null && !window.confirm(confirm)) {
      return;
    }
    setBusy(true);
    try {
      await action();
    } catch (e: any) {
      window.alert(e.message);
    } finally {
      setBusy(false);
      onDone();
    }
  }
  return h(
    Button,
    { icon, intent, minimal: true, loading: busy, onClick: click },
    label,
  );
}

function RunOutcome({ run }: { run: TaskRun }) {
  if (run.error == null) {
    return null;
  }
  return h(Callout, { intent: Intent.DANGER, className: "run-error" }, run.error);
}

function RunList({
  project,
  runs,
  contexts,
  shownId,
}: {
  project: string;
  runs: TaskRun[] | null;
  contexts: ContextOption[];
  shownId: string | null;
}) {
  if (runs == null || runs.length === 0) {
    return null;
  }
  return h("div.run-list", [
    h("h3", "Recent runs"),
    h(
      "ul",
      runs.map((run) => {
        const names = contexts
          .filter((c) => c.canvas_id === run.canvas_id)
          .map((c) => c.name)
          .join(", ");
        let className = null;
        if (run.id === shownId) {
          className = "shown";
        }
        return h("li", { key: run.id, className }, [
          h("a", { href: topologyPageURL(project, run) }, [
            h(StateTag, { state: run.state }),
            " ",
            new Date(run.created_at).toLocaleString(),
          ]),
          h("div.muted", names),
        ]);
      }),
    ),
  ]);
}

function StateTag({ state }: { state: RunState }) {
  return h(Tag, { minimal: true, intent: stateIntent[state] }, state);
}

function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);
  return now;
}

function elapsed(run: TaskRun, now: number): string | null {
  if (run.started_at == null) {
    return null;
  }
  let end = now;
  if (run.finished_at != null) {
    end = Date.parse(run.finished_at);
  }
  const seconds = Math.max(0, Math.round((end - Date.parse(run.started_at)) / 1000));
  const minutes = Math.floor(seconds / 60);
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds % 60}s`;
}

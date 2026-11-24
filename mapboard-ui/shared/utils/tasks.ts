import { apiDomain } from "~/settings";

export type RunState =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "killed";

export interface RebuildParams {
  reset: boolean;
  fix_failed: boolean;
  composite_layers: boolean;
}

export interface TaskRun {
  id: string;
  task: string;
  canvas_id: number;
  params: RebuildParams;
  state: RunState;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
}

export const defaultRebuildParams: RebuildParams = {
  reset: true,
  fix_failed: false,
  composite_layers: false,
};

const tasksURL = `${apiDomain}/api/tasks`;

export function isLive(run: TaskRun | null): boolean {
  return run?.state === "queued" || run?.state === "running";
}

export function topologyPageURL(project: string, run?: TaskRun): string {
  const base = `/projects/${project}/topology`;
  if (run == null) {
    return base;
  }
  return `${base}/${run.id}`;
}

export function runOutputURL(runId: string): string {
  return `${tasksURL}/runs/${runId}/output`;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export function fetchRuns(project: string): Promise<TaskRun[]> {
  return request(`${tasksURL}/topology/${project}`);
}

export function fetchRun(runId: string): Promise<TaskRun> {
  return request(`${tasksURL}/runs/${runId}`);
}

export function startRebuild(
  project: string,
  context: string | null,
  params: RebuildParams,
): Promise<TaskRun> {
  return request(`${tasksURL}/topology/${project}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, context }),
  });
}

export function cancelRun(runId: string): Promise<TaskRun> {
  return request(`${tasksURL}/runs/${runId}/cancel`, { method: "POST" });
}

export function killRun(runId: string): Promise<TaskRun> {
  return request(`${tasksURL}/runs/${runId}/kill`, { method: "POST" });
}

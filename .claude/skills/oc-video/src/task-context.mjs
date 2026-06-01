import path from "node:path";
import { appendLog, readEnv, taskPaths, writeJson } from "./project-fs.mjs";

function baseAndKey() {
  const env = readEnv();
  const base = (env.TASK_OPS_BASE_URL || env.WM_TASK_OPS_API_BASE_URL || env.HERMES_API_BASE_URL || "").replace(/\/+$/, "");
  const key = env.HERMES_API_KEY || env.WM_TASK_OPS_API_TOKEN || env.HERMES_API_TOKEN;
  return { base, key };
}

export async function fetchTaskContext(taskId, specialist = "video_clipping") {
  const { base, key } = baseAndKey();
  if (!base || !key) return { ok: false, error: "Task Ops credentials not configured." };
  const url = `${base}/api/hermes/tasks/${encodeURIComponent(taskId)}/context?specialist=${encodeURIComponent(specialist)}`;
  const res = await fetch(url, { headers: { "x-hermes-api-key": key, accept: "application/json" } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, body: json };
  return { ok: true, payload: json.payload || json };
}

export async function populateTaskContext(taskId) {
  const paths = taskPaths(taskId);
  const fetched = await fetchTaskContext(taskId, "video_clipping");
  if (!fetched.ok) {
    await appendLog(taskId, "context.log", `Context fetch skipped/failed: ${fetched.error}`);
    return fetched;
  }
  const payload = fetched.payload;
  await writeJson(path.join(paths.context, "task_context.json"), {
    fetched: true,
    task_id: taskId,
    payload,
    task: payload.task || null,
  });
  await writeJson(path.join(paths.context, "project_context.json"), {
    fetched: true,
    project_id: payload.project_id || null,
    project: payload.project || null,
    context_sources: payload.context_sources || [],
  });
  await appendLog(taskId, "context.log", `Fetched Task Ops context for ${taskId}.`);
  return fetched;
}

export async function attachTaskContext(taskId, { title, notes, url }) {
  const { base, key } = baseAndKey();
  if (!base || !key) return { ok: false, error: "Task Ops credentials not configured." };
  const res = await fetch(`${base}/api/hermes/tasks/${encodeURIComponent(taskId)}/attach-context`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hermes-api-key": key },
    body: JSON.stringify({ title, source_type: "note", scope: "task", notes, url }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, body: json };
  return { ok: true, source: json.source };
}

export async function setTaskStatus(taskId, status, note) {
  const { base, key } = baseAndKey();
  if (!base || !key) return { ok: false, error: "Task Ops credentials not configured." };
  const res = await fetch(`${base}/api/hermes/tasks/${encodeURIComponent(taskId)}/status`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hermes-api-key": key },
    body: JSON.stringify({ status, note }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, body: json };
  return { ok: true, result: json };
}

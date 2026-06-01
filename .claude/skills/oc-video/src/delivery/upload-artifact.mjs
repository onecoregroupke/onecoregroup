import fs from "node:fs";
import path from "node:path";
import { readEnv, readJson, taskPaths } from "../project-fs.mjs";

export async function uploadArtifact(taskId, flags = {}) {
  const paths = taskPaths(taskId);
  const file = flags.file || path.join(paths.exports, "draft.mp4");
  if (!fs.existsSync(file)) throw new Error(`Export not found: ${file}`);
  const stat = fs.statSync(file);
  const env = readEnv();
  const base = (env.TASK_OPS_BASE_URL || env.HERMES_API_BASE_URL || "").replace(/\/+$/, "");
  const key = env.HERMES_API_KEY || env.HERMES_API_TOKEN;
  const max = 25 * 1024 * 1024;
  if (stat.size > max) return { ok: false, reason: "file_too_large_for_api", bytes: stat.size, recommendation: "Use local Drive-sync delivery." };
  if (!base || !key) return { ok: false, reason: "missing_api_credentials", recommendation: "Use local Drive-sync delivery or configure credentials." };
  if (flags["dry-run"]) return { ok: true, dry_run: true, file, bytes: stat.size };
  const body = {
    task_id: taskId,
    specialist_type: "video_clipping",
    title: flags.title || `Video draft - ${taskId}`,
    filename: path.basename(file),
    content_base64: fs.readFileSync(file).toString("base64"),
    summary: flags.summary || `Video draft delivered for ${taskId}.`
  };
  const res = await fetch(`${base}/api/hermes/artifacts/upload-file`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hermes-api-key": key },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, result: json } : { ok: false, status: res.status, body: json };
}

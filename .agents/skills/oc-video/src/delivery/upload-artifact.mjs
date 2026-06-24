import fs from "node:fs";
import path from "node:path";
import { readEnv, readJson, taskPaths } from "../project-fs.mjs";

export async function uploadArtifact(taskId, flags = {}) {
  const paths = taskPaths(taskId);
  const file = flags.file || path.join(paths.exports, "draft.mp4");
  if (!fs.existsSync(file)) throw new Error(`Export not found: ${file}`);
  const stat = fs.statSync(file);
  const env = readEnv();
  const base = (env.OPS_OPS_BASE_URL || env.NEXT_PUBLIC_OPS_URL || env.TASK_OPS_BASE_URL || "").replace(/\/+$/, "");
  const key = env.OPS_AGENT_API_KEY || env.HERMES_API_KEY || env.HERMES_API_TOKEN;
  if (!base || !key) return { ok: false, reason: "missing_api_credentials", recommendation: "Use local Drive-sync delivery or configure OPS_OPS_BASE_URL and OPS_AGENT_API_KEY." };
  if (flags["dry-run"]) return { ok: true, dry_run: true, file, bytes: stat.size };
  const body = {
    task: taskId,
    specialist: "video_clipping",
    title: flags.title || `Video draft - ${taskId}`,
    content: [
      `# Video Draft - ${taskId}`,
      "",
      `File: ${file}`,
      `Filename: ${path.basename(file)}`,
      `Bytes: ${stat.size}`,
      "",
      "Large media is delivered through local Drive sync or the skill-local fallback. This artifact records the review location inside Task Ops.",
    ].join("\n"),
    summary: flags.summary || `Video draft registered for ${taskId}. Deliverable location: ${file}`,
    deliver: false,
  };
  const res = await fetch(`${base}/api/agent/artifacts`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-ops-agent-key": key },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, result: json } : { ok: false, status: res.status, body: json };
}

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PROJECTS_DIR = path.join(SKILL_ROOT, "projects");

export function rel(p) {
  return path.relative(SKILL_ROOT, p).replaceAll("\\", "/");
}

export function projectDir(taskId) {
  assertTask(taskId);
  return path.join(PROJECTS_DIR, taskId);
}

export function assertTask(taskId) {
  if (!/^TASK-(\d{4,}|[A-Z0-9][A-Z0-9-]{2,})$/i.test(String(taskId || ""))) {
    throw new Error(`Expected task id like TASK-0106 or TASK-WMACADEMY-IVY-INDUCTION, got: ${taskId}`);
  }
}

export async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

export async function writeJson(file, data) {
  await ensureDir(path.dirname(file));
  await fsp.writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export async function writeText(file, text) {
  await ensureDir(path.dirname(file));
  await fsp.writeFile(file, text, "utf8");
}

export async function appendLog(taskId, name, text) {
  const stamp = new Date().toISOString();
  const file = path.join(projectDir(taskId), "logs", name);
  await ensureDir(path.dirname(file));
  await fsp.appendFile(file, `[${stamp}]\n${text.trim()}\n\n`, "utf8");
}

export function readEnv() {
  const out = { ...process.env };
  for (const file of [
    path.join(SKILL_ROOT, ".env"),
    path.join(process.cwd(), ".env.local"),
    "F:\\Cognexa Co\\02_CODE\\WM-INTERNAL\\wm-task-ops\\.env.local",
  ]) {
    try {
      for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const i = trimmed.indexOf("=");
        const key = trimmed.slice(0, i).trim();
        let val = trimmed.slice(i + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
        if (!out[key]) out[key] = val;
      }
    } catch {}
  }
  return out;
}

export async function initProject({ taskId, mode, brand }) {
  assertTask(taskId);
  const root = projectDir(taskId);
  const dirs = [
    "context",
    "planning",
    "source",
    "scenes",
    "overlays",
    "frames",
    "renders",
    "audio/selected",
    "audio/final_mix",
    "voice/generated",
    "exports",
    "logs",
  ];
  for (const dir of dirs) await ensureDir(path.join(root, dir));

  const brandContext = readJson(path.join(SKILL_ROOT, "reference", "brands", brand, "brand.json"), { brand_id: brand });
  await writeJson(path.join(root, "context", "brand_context.json"), brandContext);
  await writeJson(path.join(root, "context", "task_context.json"), {
    task_id: taskId,
    fetched: false,
    note: "Run plan with Task Ops credentials to fetch live task context.",
  });
  await writeJson(path.join(root, "context", "project_context.json"), {
    project_id: null,
    fetched: false,
    note: "Project context is populated from Task Ops when credentials are available.",
  });
  await writeJson(path.join(root, "planning", "delivery_manifest.json"), {
    task_id: taskId,
    mode,
    brand,
    delivery_mode: "local_drive_sync",
    status: "initialized",
    delivered: false,
    outputs: [],
  });
  await appendLog(taskId, "activity.log", `Initialized ${taskId} as ${mode} using brand ${brand}.`);
  return root;
}

export function taskPaths(taskId) {
  const root = projectDir(taskId);
  return {
    root,
    context: path.join(root, "context"),
    planning: path.join(root, "planning"),
    scenes: path.join(root, "scenes"),
    overlays: path.join(root, "overlays"),
    frames: path.join(root, "frames"),
    renders: path.join(root, "renders"),
    voice: path.join(root, "voice"),
    audio: path.join(root, "audio"),
    exports: path.join(root, "exports"),
    logs: path.join(root, "logs"),
  };
}

export async function copyFileToDir(file, dir) {
  await ensureDir(dir);
  const out = path.join(dir, path.basename(file));
  await fsp.copyFile(file, out);
  return out;
}

export async function findProjectFolder(root, projectId) {
  if (!root || !fs.existsSync(root)) return null;
  const queue = [root];
  const max = 25000;
  let seen = 0;
  while (queue.length && seen < max) {
    const dir = queue.shift();
    seen++;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const full = path.join(dir, ent.name);
      if (projectId && ent.name.toUpperCase().includes(projectId.toUpperCase())) return full;
      queue.push(full);
    }
  }
  return null;
}

export async function findOrCreateWorkingFiles(projectFolder) {
  const candidates = [];
  try {
    for (const ent of fs.readdirSync(projectFolder, { withFileTypes: true })) {
      if (ent.isDirectory() && /working[-_ ]?files/i.test(ent.name)) candidates.push(path.join(projectFolder, ent.name));
    }
  } catch {}
  if (candidates[0]) return candidates[0];
  const dir = path.join(projectFolder, "03_Working-Files");
  await ensureDir(dir);
  return dir;
}

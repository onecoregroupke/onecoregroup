import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, SKILL_ROOT, taskPaths } from "../project-fs.mjs";
import {
  deletePlatformSound,
  generateSoundHandoff,
  licensedAudioAssets,
  readPlatformSounds,
  savePlatformSound,
  taskList,
} from "./sound-handoff.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

function send(res, status, body, contentType = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": contentType, "cache-control": "no-store" });
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
    res.end(body);
  } else {
    res.end(typeof body === "string" ? body : JSON.stringify(body, null, 2));
  }
}

function parseUrl(req) {
  return new URL(req.url, "http://127.0.0.1");
}

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function safeProjectPath(taskId, file) {
  const root = taskPaths(taskId).root;
  const resolved = path.resolve(root, file);
  if (!resolved.startsWith(path.resolve(root))) throw new Error("Path escapes task folder.");
  return resolved;
}

async function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = path.resolve(PUBLIC_DIR, "." + requested);
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, "Forbidden", "text/plain; charset=utf-8");
  try {
    const data = await fsp.readFile(file);
    send(res, 200, data, MIME[path.extname(file)] || "application/octet-stream");
  } catch {
    send(res, 404, "Not found", "text/plain; charset=utf-8");
  }
}

async function youtubeSearch(query) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    return {
      mode: "manual",
      message: "Set YOUTUBE_API_KEY to enable metadata search. Downloads are intentionally not supported here.",
      open_url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      results: [],
    };
  }
  const api = new URL("https://www.googleapis.com/youtube/v3/search");
  api.searchParams.set("part", "snippet");
  api.searchParams.set("type", "video");
  api.searchParams.set("maxResults", "10");
  api.searchParams.set("q", query);
  api.searchParams.set("key", key);
  const response = await fetch(api);
  if (!response.ok) throw new Error(`YouTube API returned ${response.status}`);
  const json = await response.json();
  return {
    mode: "api",
    message: "Metadata search only. Confirm rights before importing or embedding any audio.",
    results: (json.items || []).map((item) => ({
      title: item.snippet?.title || "",
      channel: item.snippet?.channelTitle || "",
      url: `https://www.youtube.com/watch?v=${item.id?.videoId}`,
      published_at: item.snippet?.publishedAt || "",
      thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || "",
    })),
  };
}

async function state(taskId) {
  const paths = taskPaths(taskId);
  const exports = fs.existsSync(paths.exports)
    ? fs.readdirSync(paths.exports).filter((name) => /\.(mp4|mov|wav|mp3|md)$/i.test(name)).sort()
    : [];
  return {
    task_id: taskId,
    skill_root: SKILL_ROOT,
    tasks: taskList(),
    project_exists: fs.existsSync(paths.root),
    project_root: paths.root,
    platform_sounds: readPlatformSounds(taskId).sounds,
    licensed_assets: licensedAudioAssets(),
    audio_plan: readJson(path.join(paths.planning, "audio_plan.json"), {}),
    delivery: readJson(path.join(paths.planning, "delivery_manifest.json"), {}),
    exports,
    handoff_exists: fs.existsSync(path.join(paths.exports, "SOUND-HANDOFF.md")),
  };
}

export async function startAudioConsole(flags = {}) {
  const port = Number(flags.port || process.env.WM_VIDEO_AUDIO_CONSOLE_PORT || 4777);
  const defaultTask = flags.task || "TASK-0107";
  const server = http.createServer(async (req, res) => {
    const url = parseUrl(req);
    try {
      if (url.pathname === "/api/state") {
        return send(res, 200, await state(url.searchParams.get("task") || defaultTask));
      }
      if (url.pathname === "/api/platform-sounds" && req.method === "POST") {
        const body = await readBody(req);
        const saved = await savePlatformSound(body.task_id || defaultTask, body.sound || {});
        return send(res, 200, { ok: true, sound: saved, state: await state(body.task_id || defaultTask) });
      }
      if (url.pathname === "/api/platform-sounds/delete" && req.method === "POST") {
        const body = await readBody(req);
        await deletePlatformSound(body.task_id || defaultTask, body.id);
        return send(res, 200, { ok: true, state: await state(body.task_id || defaultTask) });
      }
      if (url.pathname === "/api/handoff" && req.method === "POST") {
        const body = await readBody(req);
        const handoff = await generateSoundHandoff(body.task_id || defaultTask);
        return send(res, 200, { ok: true, handoff });
      }
      if (url.pathname === "/api/youtube-search") {
        const query = url.searchParams.get("q") || "";
        if (!query.trim()) return send(res, 400, { ok: false, error: "Missing q" });
        return send(res, 200, { ok: true, ...(await youtubeSearch(query)) });
      }
      if (url.pathname === "/api/file") {
        const taskId = url.searchParams.get("task") || defaultTask;
        const file = safeProjectPath(taskId, url.searchParams.get("file") || "");
        const data = await fsp.readFile(file);
        return send(res, 200, data, MIME[path.extname(file)] || "application/octet-stream");
      }
      return serveStatic(req, res, url);
    } catch (error) {
      return send(res, 500, { ok: false, error: error?.message || String(error) });
    }
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    server,
    url: `http://127.0.0.1:${port}/?task=${encodeURIComponent(defaultTask)}`,
  };
}

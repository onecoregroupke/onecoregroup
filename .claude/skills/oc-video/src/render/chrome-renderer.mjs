import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { readEnv } from "../project-fs.mjs";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export function chromePath() {
  const env = readEnv();
  const candidates = [
    env.CHROME_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "chromium",
    "google-chrome",
  ].filter(Boolean);
  return candidates.find((p) => p === "chromium" || p === "google-chrome" || fs.existsSync(p)) || null;
}

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

async function waitForPage(port) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const pages = await fetchJson(`http://127.0.0.1:${port}/json/list`);
      const page = pages.find((e) => e.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await delay(150);
  }
  throw new Error("Timed out waiting for Chrome DevTools.");
}

export async function captureScene({ htmlPath, outFile, width, height, scale = 1, transparent = false, port = 9231 }) {
  const chrome = chromePath();
  if (!chrome) throw new Error("Chrome/Chromium not found. Set CHROME_EXECUTABLE_PATH.");
  const userDataDir = path.join(path.dirname(outFile), "_chrome-profile");
  const fileUrl = `file:///${path.resolve(htmlPath).replace(/\\/g, "/").replace(/ /g, "%20")}`;
  const proc = spawn(chrome, [
    "--headless=new", "--disable-gpu", "--disable-dev-shm-usage", "--hide-scrollbars",
    "--force-device-scale-factor=1", `--window-size=${width},${height}`,
    `--user-data-dir=${userDataDir}`, `--remote-debugging-port=${port}`, fileUrl,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  proc.stderr.on("data", () => {});

  let socket;
  try {
    const wsUrl = await waitForPage(port);
    socket = new WebSocket(wsUrl);
    await new Promise((res, rej) => { socket.addEventListener("open", res, { once: true }); socket.addEventListener("error", rej, { once: true }); });
    let nextId = 1;
    const pending = new Map();
    socket.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (!msg.id) return;
      const cb = pending.get(msg.id);
      if (!cb) return;
      pending.delete(msg.id);
      msg.error ? cb.reject(new Error(JSON.stringify(msg.error))) : cb.resolve(msg.result);
    });
    const cdp = (method, params = {}) => {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    };
    await cdp("Page.enable");
    await cdp("Runtime.enable");
    await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false, screenWidth: width, screenHeight: height });
    if (transparent) await cdp("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
    await cdp("Page.reload", { ignoreCache: true });
    await delay(700);
    await cdp("Runtime.evaluate", { awaitPromise: true, expression: `document.fonts ? document.fonts.ready.then(()=>true) : true` });
    await cdp("Runtime.evaluate", { expression: `window.scrollTo(0,0)` });
    const shot = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
    await fsp.writeFile(outFile, Buffer.from(shot.data, "base64"));
    return outFile;
  } finally {
    try { socket?.close(); } catch {}
    proc.kill();
  }
}

async function withChromePage({ htmlPath, width, height, scale = 1, transparent = false, port = 9231 }, fn) {
  const chrome = chromePath();
  if (!chrome) throw new Error("Chrome/Chromium not found. Set CHROME_EXECUTABLE_PATH.");
  const userDataDir = path.join(path.dirname(htmlPath), "_chrome-profile");
  const fileUrl = `file:///${path.resolve(htmlPath).replace(/\\/g, "/").replace(/ /g, "%20")}`;
  const proc = spawn(chrome, [
    "--headless=new", "--disable-gpu", "--disable-dev-shm-usage", "--hide-scrollbars",
    "--force-device-scale-factor=1", `--window-size=${width},${height}`,
    `--user-data-dir=${userDataDir}`, `--remote-debugging-port=${port}`, fileUrl,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  proc.stderr.on("data", () => {});

  let socket;
  try {
    const wsUrl = await waitForPage(port);
    socket = new WebSocket(wsUrl);
    await new Promise((res, rej) => { socket.addEventListener("open", res, { once: true }); socket.addEventListener("error", rej, { once: true }); });
    let nextId = 1;
    const pending = new Map();
    socket.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (!msg.id) return;
      const cb = pending.get(msg.id);
      if (!cb) return;
      pending.delete(msg.id);
      msg.error ? cb.reject(new Error(JSON.stringify(msg.error))) : cb.resolve(msg.result);
    });
    const cdp = (method, params = {}) => {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    };
    await cdp("Page.enable");
    await cdp("Runtime.enable");
    await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false, screenWidth: width, screenHeight: height });
    if (transparent) await cdp("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
    await cdp("Page.reload", { ignoreCache: true });
    await delay(700);
    await cdp("Runtime.evaluate", { awaitPromise: true, expression: `document.fonts ? document.fonts.ready.then(()=>true) : true` });
    await cdp("Runtime.evaluate", { expression: `window.scrollTo(0,0)` });
    return await fn(cdp);
  } finally {
    try { socket?.close(); } catch {}
    proc.kill();
  }
}

export async function captureSceneFrames({ htmlPath, outDir, width, height, fps = 30, durationSeconds = 5, scale = 1, transparent = false, port = 9231 }) {
  await fsp.mkdir(outDir, { recursive: true });
  const totalFrames = Math.max(1, Math.round(durationSeconds * fps));
  return withChromePage({ htmlPath, width, height, scale, transparent, port }, async (cdp) => {
    const supportsRenderAt = await cdp("Runtime.evaluate", {
      expression: `typeof window.renderAt === "function"`,
      returnByValue: true,
    });
    for (let frame = 0; frame < totalFrames; frame++) {
      const t = frame / fps;
      if (supportsRenderAt.result?.value) {
        await cdp("Runtime.evaluate", {
          awaitPromise: true,
          expression: `Promise.resolve(window.renderAt(${JSON.stringify(t)}))`,
        });
      } else {
        await cdp("Runtime.evaluate", {
          expression: `document.documentElement.style.setProperty("--wm-video-time", ${JSON.stringify(t)})`,
        });
      }
      const shot = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
      const name = `frame-${String(frame + 1).padStart(6, "0")}.png`;
      await fsp.writeFile(path.join(outDir, name), Buffer.from(shot.data, "base64"));
    }
    return { outDir, frames: totalFrames };
  });
}

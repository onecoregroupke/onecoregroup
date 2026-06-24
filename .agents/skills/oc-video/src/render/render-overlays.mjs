import fs from "node:fs";
import path from "node:path";
import { appendLog, readJson, taskPaths } from "../project-fs.mjs";
import { captureScene } from "./chrome-renderer.mjs";

export async function renderOverlays(taskId, flags = {}) {
  const paths = taskPaths(taskId);
  const overlays = fs.existsSync(paths.overlays) ? fs.readdirSync(paths.overlays).filter((d) => d.startsWith("overlay_")).sort() : [];
  const rendered = [];
  for (const overlayId of overlays) {
    const dir = path.join(paths.overlays, overlayId);
    const meta = readJson(path.join(dir, "scene.json"), {});
    const out = path.join(paths.renders, `${overlayId}.png`);
    if (flags["dry-run"]) {
      rendered.push({ overlay_id: overlayId, dry_run: true, out });
      continue;
    }
    await captureScene({
      htmlPath: path.join(dir, "index.html"),
      outFile: out,
      width: meta.width || 1920,
      height: meta.height || 1080,
      scale: Number(flags.scale || 1),
      transparent: true,
      port: Number(flags.port || 9232),
    });
    rendered.push({ overlay_id: overlayId, out });
  }
  await appendLog(taskId, "render.log", `Rendered overlays: ${JSON.stringify(rendered)}`);
  return rendered;
}

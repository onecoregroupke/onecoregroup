import fs from "node:fs";
import path from "node:path";
import { appendLog, readJson, taskPaths } from "../project-fs.mjs";
import { captureScene, captureSceneFrames } from "./chrome-renderer.mjs";

export async function renderScenes(taskId, flags = {}) {
  const paths = taskPaths(taskId);
  const scenes = fs.existsSync(paths.scenes) ? fs.readdirSync(paths.scenes).filter((d) => d.startsWith("scene_")).sort() : [];
  const rendered = [];
  for (const sceneId of scenes) {
    const dir = path.join(paths.scenes, sceneId);
    const meta = readJson(path.join(dir, "scene.json"), {});
    const out = path.join(paths.renders, `${sceneId}.png`);
    const frameDir = path.join(paths.frames, sceneId);
    const frameMode = flags.frames || meta.render_mode === "frames" || fs.existsSync(path.join(dir, "motion_timeline.json"));
    if (flags["dry-run"]) {
      rendered.push({ scene_id: sceneId, dry_run: true, out: frameMode ? frameDir : out, frame_mode: frameMode });
      continue;
    }
    if (frameMode) {
      const result = await captureSceneFrames({
        htmlPath: path.join(dir, "index.html"),
        outDir: frameDir,
        width: meta.width || 1920,
        height: meta.height || 1080,
        fps: meta.fps || 30,
        durationSeconds: meta.duration_seconds || 5,
        scale: Number(flags.scale || 1),
        transparent: !!meta.transparent,
        port: Number(flags.port || 9231),
      });
      rendered.push({ scene_id: sceneId, ...result });
    } else {
      await captureScene({
        htmlPath: path.join(dir, "index.html"),
        outFile: out,
        width: meta.width || 1920,
        height: meta.height || 1080,
        scale: Number(flags.scale || 1),
        transparent: !!meta.transparent,
        port: Number(flags.port || 9231),
      });
      rendered.push({ scene_id: sceneId, out });
    }
  }
  await appendLog(taskId, "render.log", `Rendered scenes: ${JSON.stringify(rendered)}`);
  return rendered;
}

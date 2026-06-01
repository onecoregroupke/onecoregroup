import path from "node:path";
import { readJson, taskPaths, writeJson, writeText } from "../project-fs.mjs";
import { animationJs, sceneCss, sceneHtml } from "./component-factory.mjs";

export async function generateOverlayScenes(taskId) {
  const paths = taskPaths(taskId);
  const plan = readJson(path.join(paths.planning, "talking_head_plan.json"));
  if (!plan) throw new Error("Missing planning/talking_head_plan.json. Run plan first.");
  const generated = [];
  for (const overlay of plan.overlays || []) {
    const dir = path.join(paths.overlays, overlay.overlay_id);
    await writeText(path.join(dir, "index.html"), sceneHtml({
      title: overlay.title,
      eyebrow: "WM & Co",
      headline: overlay.title,
      subhead: "Transparent overlay draft.",
      transparent: true
    }));
    await writeText(path.join(dir, "styles.css"), sceneCss({ transparent: true }));
    await writeText(path.join(dir, "animation.js"), animationJs());
    await writeJson(path.join(dir, "scene.json"), {
      scene_id: overlay.overlay_id,
      title: overlay.title,
      duration_seconds: overlay.duration_seconds || 5,
      width: plan.format?.width || 1920,
      height: plan.format?.height || 1080,
      fps: plan.format?.fps || 30,
      transparent: true,
      intended_use: "overlay"
    });
    generated.push(dir);
  }
  return generated;
}

import path from "node:path";
import { readJson, taskPaths, writeJson } from "../project-fs.mjs";

export async function createTalkingHeadPlan(taskId) {
  const paths = taskPaths(taskId);
  const taskContext = readJson(path.join(paths.context, "task_context.json"), {});
  const task = taskContext.payload?.task || taskContext.task || {};
  const plan = {
    task_id: taskId,
    mode: "talking_head",
    title: task.title || `Talking-head enhancement for ${taskId}`,
    source_video: null,
    format: { width: 1920, height: 1080, fps: 30, aspect_ratio: "16:9" },
    captions: { enabled: true, source: null, style: "reference/brands/wmandco/caption_style.ass" },
    overlays: [
      {
        overlay_id: "overlay_001",
        title: "Opening lower third",
        duration_seconds: 5,
        transparent: true,
        component: "lower_third"
      }
    ],
    todos: ["Add source video to source/ and set source_video.", "Add transcription helper later if reusable.", "YouTube download remains TODO."],
    risks: ["Compile must fail if source_video is missing."]
  };
  const file = path.join(paths.planning, "talking_head_plan.json");
  await writeJson(file, plan);
  return { path: file, plan };
}

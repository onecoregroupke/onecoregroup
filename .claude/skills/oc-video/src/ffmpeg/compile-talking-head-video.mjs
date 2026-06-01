import fs from "node:fs";
import path from "node:path";
import { appendLog, readJson, taskPaths, writeText } from "../project-fs.mjs";
import { ffmpegPath, runOrDry } from "./ffmpeg-utils.mjs";

export async function compileTalkingHeadVideo(taskId, flags = {}) {
  const paths = taskPaths(taskId);
  const manifest = readJson(path.join(paths.planning, "render_manifest.json"), null);
  if (!manifest) throw new Error("Missing planning/render_manifest.json. Run build-manifest first.");
  if (!manifest.source_video) {
    const report = `# Missing Source Video - ${taskId}\n\nPlace the talking-head source video in source/ and set source_video in planning/talking_head_plan.json.\n\nTODO: YouTube download and transcription helpers are intentionally scaffolded, not implemented.\n`;
    await writeText(path.join(paths.logs, "missing-source-video.md"), report);
    throw new Error("Missing source_video for talking_head compile.");
  }
  const source = path.resolve(paths.root, manifest.source_video);
  if (!fs.existsSync(source) && !flags["dry-run"]) throw new Error(`Source video not found: ${source}`);
  const out = path.join(paths.exports, "draft.mp4");
  const cmd = [ffmpegPath(), "-y", "-i", source, "-c:v", "libx264", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out];
  await appendLog(taskId, "ffmpeg.log", cmd.join(" "));
  const result = await runOrDry(cmd, { dryRun: flags["dry-run"] });
  return { output: out, command: cmd, result, todos: ["Caption burn-in", "overlay compositing", "voice/music ducking refinement"] };
}

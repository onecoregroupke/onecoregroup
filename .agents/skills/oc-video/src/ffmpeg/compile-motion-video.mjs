import fs from "node:fs";
import path from "node:path";
import { appendLog, ensureDir, readJson, taskPaths, writeText } from "../project-fs.mjs";
import { ffmpegPath, runOrDry } from "./ffmpeg-utils.mjs";
import { concatFileText, stillImageVideoArgs } from "./filtergraph-builder.mjs";
import { mixFinalAudio } from "../audio/mix-final-audio.mjs";

export async function compileMotionVideo(taskId, flags = {}) {
  const paths = taskPaths(taskId);
  const manifest = readJson(path.join(paths.planning, "render_manifest.json"), null);
  if (!manifest) throw new Error("Missing planning/render_manifest.json. Run build-manifest first.");
  if (manifest.audio?.voiceover?.required && !manifest.audio?.voiceover?.enabled) {
    throw new Error("Voiceover is required but missing. Run validate-voice, install/configure Piper, use manual voiceover, or disable voiceover_required.");
  }
  await ensureDir(paths.exports);
  await ensureDir(paths.renders);
  const sceneVideos = [];
  for (const scene of manifest.scenes || []) {
    const image = path.join(paths.renders, `${scene.scene_id}.png`);
    const frameDir = path.join(paths.frames, scene.scene_id);
    const out = path.join(paths.renders, `${scene.scene_id}.mp4`);
    const hasFrames = fs.existsSync(path.join(frameDir, "frame-000001.png"));
    if (!hasFrames && !fs.existsSync(image) && !flags["dry-run"]) throw new Error(`Missing rendered scene image: ${image}`);
    const cmd = hasFrames
      ? [ffmpegPath(), "-y", "-framerate", String(scene.fps || manifest.format.fps || 30), "-i", path.join(frameDir, "frame-%06d.png"), "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", out]
      : [ffmpegPath(), "-y", ...stillImageVideoArgs({
        image,
        duration: scene.duration_seconds || 5,
        out,
        width: scene.width || manifest.format.width,
        height: scene.height || manifest.format.height
      })];
    await appendLog(taskId, "ffmpeg.log", cmd.join(" "));
    if (!flags["dry-run"]) await runOrDry(cmd);
    sceneVideos.push(out);
  }
  const concatFile = path.join(paths.renders, "concat.txt");
  await writeText(concatFile, concatFileText(sceneVideos));
  const draft = path.join(paths.exports, "draft.mp4");
  const videoOnly = manifest.audio?.voiceover?.enabled ? path.join(paths.exports, "draft_video_only.mp4") : draft;
  const cmd = [ffmpegPath(), "-y", "-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", videoOnly];
  await appendLog(taskId, "ffmpeg.log", cmd.join(" "));
  const result = await runOrDry(cmd, { dryRun: flags["dry-run"] });
  let audioMix = null;
  let mux = null;
  if (manifest.audio?.voiceover?.enabled) {
    audioMix = await mixFinalAudio(taskId, flags);
    if (audioMix?.output) {
      const muxCmd = [ffmpegPath(), "-y", "-i", videoOnly, "-i", audioMix.output, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", draft];
      await appendLog(taskId, "ffmpeg.log", muxCmd.join(" "));
      mux = await runOrDry(muxCmd, { dryRun: flags["dry-run"] });
    }
  }
  return { output: draft, command: cmd, result, audio_mix: audioMix, mux };
}

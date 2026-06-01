import path from "node:path";
import { appendLog, readJson, taskPaths } from "../project-fs.mjs";
import { ffmpegPath, runOrDry } from "../ffmpeg/ffmpeg-utils.mjs";

export async function mixAudio(taskId, flags = {}) {
  const paths = taskPaths(taskId);
  const plan = readJson(path.join(paths.planning, "audio_plan.json"), {});
  const out = path.join(paths.audio, "final_mix", "mix.wav");
  const cmd = [ffmpegPath(), "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", String(flags.duration || 5), "-af", `loudnorm=I=${plan.target_loudness_lufs ?? -14}:TP=${plan.true_peak_db ?? -1}:LRA=11`, out];
  await appendLog(taskId, "ffmpeg.log", cmd.join(" "));
  return runOrDry(cmd, { dryRun: flags["dry-run"] });
}

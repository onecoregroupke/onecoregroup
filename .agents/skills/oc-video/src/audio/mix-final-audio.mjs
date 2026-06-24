import fs from "node:fs";
import path from "node:path";
import { ffmpegPath, runOrDry } from "../ffmpeg/ffmpeg-utils.mjs";
import { readJson, SKILL_ROOT, taskPaths } from "../project-fs.mjs";
import { resolveAudioAsset } from "./audio-library.mjs";

export async function mixFinalAudio(taskId, flags = {}) {
  const paths = taskPaths(taskId);
  const audioPlan = readJson(path.join(paths.planning, "audio_plan.json"), {});
  const voiceFile = path.join(paths.voice, "final_voiceover.wav");
  const out = path.join(paths.audio, "final_mix", "final_mix.wav");
  if (!fs.existsSync(voiceFile)) return null;
  const musicEntry = audioPlan.music?.[0] || null;
  const musicAsset = musicEntry?.asset_id ? resolveAudioAsset(musicEntry.asset_id) : null;
  const musicPath = musicEntry?.path
    ? path.resolve(SKILL_ROOT, musicEntry.path)
    : musicAsset?.path
      ? path.resolve(SKILL_ROOT, musicAsset.path)
      : null;
  const target = audioPlan.target_loudness_lufs ?? -14;
  const peak = audioPlan.true_peak_db ?? -1;
  let cmd;
  if (musicPath && fs.existsSync(musicPath)) {
    cmd = [
      ffmpegPath(), "-y",
      "-i", voiceFile,
      "-stream_loop", "-1", "-i", musicPath,
      "-filter_complex",
      `[0:a]highpass=f=80,acompressor=threshold=-18dB:ratio=2.2[voice];[1:a]volume=0.08[music];[music][voice]sidechaincompress=threshold=0.035:ratio=8:attack=60:release=700[ducked];[voice][ducked]amix=inputs=2:duration=first:dropout_transition=0,loudnorm=I=${target}:TP=${peak}:LRA=11[aout]`,
      "-map", "[aout]",
      "-ar", "48000",
      "-ac", "2",
      out,
    ];
  } else {
    cmd = [
      ffmpegPath(), "-y",
      "-i", voiceFile,
      "-af", `highpass=f=80,acompressor=threshold=-18dB:ratio=2.2,loudnorm=I=${target}:TP=${peak}:LRA=11`,
      "-ar", "48000",
      "-ac", "2",
      out,
    ];
  }
  await runOrDry(cmd, { dryRun: flags["dry-run"] });
  return { output: out, command: cmd };
}

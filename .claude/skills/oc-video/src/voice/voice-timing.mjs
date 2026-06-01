import { spawn } from "node:child_process";
import { ffprobePath } from "../ffmpeg/ffmpeg-utils.mjs";

export function combinedVoiceText(segments) {
  return (segments || []).map((segment) => segment.text).join("\n\n");
}

export function estimateSegmentsDuration(segments) {
  return (segments || []).reduce((sum, segment) => sum + Number(segment.target_duration_seconds || 0), 0);
}

export async function audioDurationSeconds(file) {
  return new Promise((resolve) => {
    const proc = spawn(ffprobePath(), ["-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", file], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    proc.stdout.on("data", (d) => out += d);
    proc.on("close", (code) => resolve(code === 0 ? Number.parseFloat(out) : null));
  });
}

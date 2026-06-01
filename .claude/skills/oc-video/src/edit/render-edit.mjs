// FFmpeg render for `edit` mode: cut to the EDL keep-segments, concat, reframe
// to the target aspect, burn captions, normalize loudness. Deterministic and
// manifest-driven. The command builders are exported pure so they can be tested
// against a generated clip without a real source video.
import fs from "node:fs";
import path from "node:path";
import { appendLog, ensureDir, readJson, taskPaths, writeText } from "../project-fs.mjs";
import { ffmpegPath, runOrDry } from "../ffmpeg/ffmpeg-utils.mjs";

// ---- pure command builders (testable) --------------------------------------

// Reframe filter: fit a source into outW x outH.
//  - "crop" (default): fill, center-crop overflow (16:9 -> 9:16 social).
//  - "pad": letterbox/pillarbox, no crop.
//  - "stretch": ignore aspect.
export function reframeFilter(outW, outH, mode = "crop") {
  if (mode === "pad") return `scale=${outW}:${outH}:force_original_aspect_ratio=decrease,pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
  if (mode === "stretch") return `scale=${outW}:${outH},setsar=1`;
  return `scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH},setsar=1`;
}

// Extract one segment with output seeking (frame-accurate) and re-encode so all
// segments share codec params and concat-copy cleanly.
export function extractSegmentArgs({ src, start, end, out, crf = 20, preset = "veryfast" }) {
  return [
    ffmpegPath(), "-y", "-i", src, "-ss", String(start), "-to", String(end),
    "-c:v", "libx264", "-preset", preset, "-crf", String(crf), "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-avoid_negative_ts", "make_zero", out,
  ];
}

export function concatArgs({ listFile, out }) {
  return [ffmpegPath(), "-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", out];
}

// Final pass: reframe (+ optional caption burn) + loudnorm. captionsFile must be
// a path RELATIVE to cwd (we run ffmpeg in the render dir to avoid Windows
// filtergraph path-escaping pain).
export function finalPassArgs({ input, out, reframe, captionsFile = null, loudness = -14, truePeak = -1, crf = 19 }) {
  const vf = [reframe, captionsFile ? `subtitles=${captionsFile}` : null].filter(Boolean).join(",");
  return [
    ffmpegPath(), "-y", "-i", input,
    "-vf", vf,
    "-af", `loudnorm=I=${loudness}:TP=${truePeak}:LRA=11`,
    "-c:v", "libx264", "-preset", "medium", "-crf", String(crf), "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out,
  ];
}

export function concatListText(files) {
  return files.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n") + "\n";
}

// ---- orchestrator ----------------------------------------------------------

export async function renderEdit(taskId, flags = {}) {
  const paths = taskPaths(taskId);
  const plan = readJson(path.join(paths.planning, "edit_plan.json"), null);
  if (!plan) throw new Error("Missing planning/edit_plan.json. Run plan with --mode edit first.");
  const src = plan.source_video;
  if (!src || !fs.existsSync(src)) throw new Error(`Source video not found: ${src || "(none)"}. Set it via --source on the edit plan.`);

  const edl = readJson(path.join(paths.planning, "edl.json"), null);
  const fmt = plan.format || { width: 1080, height: 1920, fps: 30 };
  const reframe = reframeFilter(fmt.width, fmt.height, plan.reframe?.mode || "crop");

  let segments = edl?.keep_segments?.length ? edl.keep_segments : null;
  if (!segments) segments = [{ start: 0, end: plan.source_duration_seconds || null }];

  const workDir = path.join(paths.renders, "edit");
  await ensureDir(workDir);
  await ensureDir(paths.exports);

  // 1. extract kept segments
  const segFiles = [];
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const out = path.join(workDir, `seg_${String(i + 1).padStart(3, "0")}.mp4`);
    const args = extractSegmentArgs({ src, start: s.start ?? 0, end: s.end ?? plan.source_duration_seconds, out });
    await appendLog(taskId, "ffmpeg-edit.log", args.join(" "));
    if (!flags["dry-run"]) await runOrDry(args);
    segFiles.push(out);
  }

  // 2. concat
  const listFile = path.join(workDir, "concat.txt");
  await writeText(listFile, concatListText(segFiles));
  const joined = path.join(workDir, "joined.mp4");
  const cArgs = concatArgs({ listFile, out: joined });
  await appendLog(taskId, "ffmpeg-edit.log", cArgs.join(" "));
  if (!flags["dry-run"]) await runOrDry(cArgs);

  // 3. captions (optional) — copy .ass into workDir so we can reference it relatively
  let captionsRel = null;
  if (plan.captions?.enabled) {
    const assPath = path.join(paths.planning, "captions.ass");
    if (fs.existsSync(assPath)) {
      const localAss = path.join(workDir, "captions.ass");
      if (!flags["dry-run"]) await fs.promises.copyFile(assPath, localAss);
      captionsRel = "captions.ass";
    }
  }

  // 4. final pass — reframe (+captions) + loudnorm
  const draft = path.join(paths.exports, "draft.mp4");
  const fArgs = finalPassArgs({
    input: joined, out: draft, reframe, captionsFile: captionsRel,
    loudness: plan.normalize?.loudness_lufs ?? -14, truePeak: plan.normalize?.true_peak_db ?? -1,
  });
  await appendLog(taskId, "ffmpeg-edit.log", `(cwd=${workDir}) ${fArgs.join(" ")}`);
  let result = { dry_run: true };
  if (!flags["dry-run"]) result = await runOrDry(fArgs, { cwd: workDir });

  return {
    output: draft,
    segments: segFiles.length,
    reframe: plan.reframe?.mode || "crop",
    captions: !!captionsRel,
    format: fmt,
    result: flags["dry-run"] ? "dry-run" : "rendered",
  };
}

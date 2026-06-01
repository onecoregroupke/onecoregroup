// Planner for `edit` mode: probe a source video and write edit_plan.json — the
// manifest the EDL builder and the FFmpeg renderer consume.
import fs from "node:fs";
import path from "node:path";
import { readJson, taskPaths, writeJson } from "../project-fs.mjs";
import { ffprobePath, runOrDry } from "../ffmpeg/ffmpeg-utils.mjs";

const ASPECTS = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};

async function probe(src) {
  try {
    const { stdout } = await runOrDry([ffprobePath(), "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", src]);
    const data = JSON.parse(stdout || "{}");
    const v = (data.streams || []).find((s) => s.codec_type === "video") || {};
    const fmt = data.format || {};
    return {
      duration: Number(fmt.duration || v.duration || 0) || null,
      width: v.width || null,
      height: v.height || null,
    };
  } catch {
    return { duration: null, width: null, height: null };
  }
}

export async function createEditPlan(taskId, flags = {}) {
  const paths = taskPaths(taskId);
  const existing = readJson(path.join(paths.planning, "edit_plan.json"), {});
  const source = flags.source || flags.file || existing.source_video || null;
  if (!source) throw new Error("edit mode needs a source video. Pass --source <local-path>. (URLs: run `reference` ingest first, then point --source at the downloaded file.)");
  if (!fs.existsSync(source)) throw new Error(`Source video not found: ${source}`);

  const meta = await probe(source);
  const aspect = flags.aspect && ASPECTS[flags.aspect] ? ASPECTS[flags.aspect] : null;
  const format = aspect
    || (flags.width && flags.height ? { width: Number(flags.width), height: Number(flags.height) } : null)
    || (meta.width && meta.height ? { width: meta.width, height: meta.height } : { width: 1920, height: 1080 });
  const sameAspect = meta.width && meta.height && Math.abs((meta.width / meta.height) - (format.width / format.height)) < 0.01;

  const plan = {
    task_id: taskId,
    mode: "edit",
    source_video: path.resolve(source),
    source_duration_seconds: meta.duration,
    source_size: { width: meta.width, height: meta.height },
    format: { ...format, fps: Number(flags.fps) || 30 },
    reframe: { mode: flags.reframe || (sameAspect ? "pad" : "crop") },
    captions: { enabled: flags.captions !== "off", style: "reference/brands/wmandco/caption_style.ass" },
    edit: {
      remove_silence: flags["keep-silence"] ? false : true,
      remove_fillers: flags["keep-fillers"] ? false : true,
      min_silence_seconds: Number(flags["min-silence"]) || 0.6,
    },
    normalize: { loudness_lufs: -14, true_peak_db: -1 },
    overlays: [],
    todos: [
      "Run transcribe-source, then build-edl.",
      "Review planning/edl.json (keep_segments) before compile.",
      "Add overlays (lower thirds, CTAs) to overlays[] if needed.",
    ],
  };
  const file = path.join(paths.planning, "edit_plan.json");
  await writeJson(file, plan);
  return { path: file, plan };
}

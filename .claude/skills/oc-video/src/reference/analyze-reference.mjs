// reference: analyze a reference video into a structured style profile that the
// planner can use as INSPIRATION (pacing, shot rhythm, palette, on-screen
// cadence). Never copies footage; final styling always uses the client brand.
//
// Adapted in part from bradautomates/claude-video (MIT) — see NOTICE.md.
import fs from "node:fs";
import path from "node:path";
import { taskPaths, ensureDir, readJson, appendLog, SKILL_ROOT } from "../project-fs.mjs";
import { runPython } from "../align/py-env.mjs";

export async function analyzeReference(taskId, flags = {}) {
  const source = flags.source || flags.url || flags.file;
  if (!source) throw new Error("Provide --source <url-or-path> (YouTube/Vimeo/TikTok/etc. URL or a local video file).");

  const paths = taskPaths(taskId);
  const refId = String(flags.id || `ref_${Date.now().toString(36)}`);
  const outDir = path.join(paths.root, "reference", refId);
  await ensureDir(outDir);

  const script = path.join(SKILL_ROOT, "scripts", "reference_analyze.py");
  const args = [script, source, "--out", outDir, "--max-frames", String(flags["max-frames"] || 60)];
  if (flags["no-whisper"]) args.push("--no-whisper");
  if (flags.language) args.push("--language", String(flags.language));

  const { stdout } = await runPython(args, { timeoutMs: Number(flags.timeout) || 0 });
  const profile = JSON.parse(stdout.trim().split(/\r?\n/).pop());
  if (!profile.ok) throw new Error(profile.error || "reference analysis returned not-ok");

  await appendLog(taskId, "reference.log",
    `reference ${refId} source=${source} shots=${profile.pacing?.shot_count ?? 0} frames=${profile.frames?.length ?? 0} warnings=${(profile.warnings || []).length}`);

  return {
    reference_id: refId,
    out_dir: outDir.replace(SKILL_ROOT, "").replace(/^[\\/]/, ""),
    style_profile: path.join(outDir, "style_profile.json").replace(SKILL_ROOT, "").replace(/^[\\/]/, ""),
    meta: profile.meta,
    pacing: profile.pacing,
    palette_colors: profile.palette?.colors || [],
    frame_count: profile.frames?.length || 0,
    frame_paths: (profile.frames || []).map((f) => f.path),
    has_transcript: !!(profile.transcript && profile.transcript.text),
    warnings: profile.warnings || [],
    next: "Read the listed frame_paths + style_profile.json, then use pacing/palette as inspiration in the motion plan. Keep final styling on the client brand.",
  };
}

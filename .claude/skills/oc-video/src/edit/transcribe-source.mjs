// transcribe-source: word-level transcript of the edit source video (faster-whisper).
// faster-whisper.load_audio extracts audio from the video via ffmpeg, so we can point
// the aligner straight at the source file. Honest failure if the .venv is missing.
import fs from "node:fs";
import path from "node:path";
import { readJson, taskPaths, writeJson, appendLog, SKILL_ROOT } from "../project-fs.mjs";
import { runPython } from "../align/py-env.mjs";

export async function transcribeSource(taskId, flags = {}) {
  const paths = taskPaths(taskId);
  const plan = readJson(path.join(paths.planning, "edit_plan.json"), null);
  if (!plan) throw new Error("Missing planning/edit_plan.json. Run plan --mode edit first.");
  const src = plan.source_video;
  if (!src || !fs.existsSync(src)) throw new Error(`Source video not found: ${src || "(none)"}`);

  const script = path.join(SKILL_ROOT, "scripts", "transcribe_align.py");
  const { stdout } = await runPython([
    script, src,
    "--language", flags.language || "en",
    "--model", flags.model || "small",
    "--device", flags.device || "cpu",
  ], { timeoutMs: Number(flags.timeout) || 0 });
  const parsed = JSON.parse(stdout.trim().split(/\r?\n/).pop());
  if (!parsed.ok) throw new Error(parsed.error || "faster-whisper returned not-ok");

  const out = path.join(paths.root, "edit", "transcript.json");
  await writeJson(out, parsed);
  await appendLog(taskId, "edit.log", `transcribe-source words=${parsed.words?.length ?? 0} duration=${parsed.duration ?? "?"}`);
  return {
    transcript: out.replace(SKILL_ROOT, "").replace(/^[\\/]/, ""),
    words: parsed.words?.length ?? 0,
    segments: parsed.segments?.length ?? 0,
    duration_seconds: parsed.duration ?? null,
  };
}

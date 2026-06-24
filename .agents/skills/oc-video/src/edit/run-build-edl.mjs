// build-edl command: transcript -> EDL (keep_segments) + burn-ready captions.ass.
// Produces a reviewable edit before any rendering. Pure engines underneath.
import path from "node:path";
import { readJson, taskPaths, writeJson, writeText, appendLog, SKILL_ROOT } from "../project-fs.mjs";
import { buildEdl } from "./build-edl.mjs";
import { buildAss } from "./captions-ass.mjs";

export async function runBuildEdl(taskId, flags = {}) {
  const paths = taskPaths(taskId);
  const plan = readJson(path.join(paths.planning, "edit_plan.json"), null);
  if (!plan) throw new Error("Missing planning/edit_plan.json. Run plan --mode edit first.");
  const transcript = readJson(path.join(paths.root, "edit", "transcript.json"), null);
  if (!transcript) throw new Error("Missing edit/transcript.json. Run transcribe-source first.");

  const edl = buildEdl(transcript, {
    remove_silence: flags["keep-silence"] ? false : (plan.edit?.remove_silence !== false),
    remove_fillers: flags["keep-fillers"] ? false : (plan.edit?.remove_fillers !== false),
    min_silence_seconds: Number(flags["min-silence"]) || plan.edit?.min_silence_seconds || 0.6,
  });
  edl.task_id = taskId;
  edl.source_video = plan.source_video;
  await writeJson(path.join(paths.planning, "edl.json"), edl);

  let captions = null;
  if (plan.captions?.enabled) {
    const { ass, line_count } = buildAss(transcript, { width: plan.format?.width, height: plan.format?.height });
    await writeText(path.join(paths.planning, "captions.ass"), ass);
    captions = { file: "planning/captions.ass", lines: line_count };
  }

  await appendLog(taskId, "edit.log",
    `build-edl segments=${edl.stats.segment_count} removed=${edl.stats.removed_seconds}s (silence=${edl.stats.silence_count}, filler=${edl.stats.filler_count})`);

  return {
    edl: "planning/edl.json",
    stats: edl.stats,
    captions,
    review_note: "Review planning/edl.json keep_segments before compile. Adjust with --keep-silence / --keep-fillers / --min-silence and re-run.",
  };
}

// align-voice: turn the generated narration into word-level alignment and a
// reconciled, voice-locked timing plan that the scene generator consumes.
//
// Flow: final_voiceover.wav --faster-whisper--> alignment.json
//        + motion_plan.json  --deriveTiming--> derived_timing.json
// Then (if scenes already exist) patch each scene.json duration + timelines so
// re-renders are voice-accurate. Honest failure if faster-whisper/.venv is missing,
// unless --allow-fallback is passed (proportional timing, clearly marked).
import fs from "node:fs";
import path from "node:path";
import { readJson, taskPaths, writeJson, appendLog } from "../project-fs.mjs";
import { runPython } from "./py-env.mjs";
import { deriveTiming } from "./derive-timing.mjs";
import { SKILL_ROOT } from "../project-fs.mjs";

export async function alignVoice(taskId, flags = {}) {
  const paths = taskPaths(taskId);
  const plan = readJson(path.join(paths.planning, "motion_plan.json"));
  if (!plan) throw new Error("Missing planning/motion_plan.json. Run plan first.");

  const audio = path.join(paths.voice, "final_voiceover.wav");
  const haveAudio = fs.existsSync(audio);
  let alignment = { words: [] };
  let alignmentSource = "none";

  if (haveAudio) {
    try {
      const script = path.join(SKILL_ROOT, "scripts", "transcribe_align.py");
      const { stdout } = await runPython([
        script, audio,
        "--language", flags.language || "en",
        "--model", flags.model || "small",
        "--device", flags.device || "cpu",
      ], { timeoutMs: Number(flags.timeout) || 0 });
      const parsed = JSON.parse(stdout.trim().split(/\r?\n/).pop());
      if (!parsed.ok) throw new Error(parsed.error || "faster-whisper returned not-ok");
      alignment = parsed;
      alignmentSource = `faster-whisper:${parsed.model || "small"}`;
      await writeJson(path.join(paths.voice, "alignment.json"), parsed);
    } catch (e) {
      if (!flags["allow-fallback"]) {
        await appendLog(taskId, "align.log", `Alignment failed: ${e.message}`);
        throw new Error(`Voice alignment failed: ${e.message}\nFix the .venv/faster-whisper, or pass --allow-fallback for proportional timing.`);
      }
      alignmentSource = "proportional_fallback";
    }
  } else if (!flags["allow-fallback"]) {
    throw new Error("Missing voice/final_voiceover.wav. Run generate-voice first, or pass --allow-fallback.");
  } else {
    alignmentSource = "no_audio_fallback";
  }

  const derived = deriveTiming(plan, alignment, {
    scene_pad_seconds: Number(flags.pad) || 0.25,
    lead_in_seconds: Number(flags["lead-in"]) || 0,
  });
  derived.alignment_source = alignmentSource;
  const derivedFile = path.join(paths.planning, "derived_timing.json");
  await writeJson(derivedFile, derived);

  // Patch any already-generated scenes so they match the voice without a full
  // regenerate. (generate-scenes also prefers derived_timing.json on its own.)
  let patched = 0;
  for (const s of derived.scenes) {
    const dir = path.join(paths.scenes, s.scene_id);
    if (!fs.existsSync(dir)) continue;
    const sceneMeta = readJson(path.join(dir, "scene.json"), {});
    sceneMeta.duration_seconds = s.duration_seconds;
    sceneMeta.timing_source = s.timing_source;
    await writeJson(path.join(dir, "scene.json"), sceneMeta);
    await writeJson(path.join(dir, "caption_timeline.json"), s.timelines.caption_timeline);
    await writeJson(path.join(dir, "focus_timeline.json"), s.timelines.focus_timeline);
    await writeJson(path.join(dir, "motion_timeline.json"), s.timelines.motion_timeline);
    await writeJson(path.join(dir, "beat_timeline.json"), s.timelines.beat_timeline);
    patched++;
  }

  await appendLog(taskId, "align.log",
    `align-voice ok source=${alignmentSource} scenes=${derived.scenes.length} total=${derived.total_duration_seconds}s patched=${patched}`);

  return {
    alignment_source: alignmentSource,
    derived_timing: derivedFile.replace(SKILL_ROOT, "").replace(/^[\\/]/, ""),
    total_duration_seconds: derived.total_duration_seconds,
    narration_duration_seconds: derived.narration_duration_seconds,
    scenes: derived.scenes.map((s) => ({ scene_id: s.scene_id, duration: s.duration_seconds, source: s.timing_source })),
    scenes_patched: patched,
  };
}

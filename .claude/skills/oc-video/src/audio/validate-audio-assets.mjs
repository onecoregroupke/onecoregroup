import path from "node:path";
import { resolveAudioAsset, fileExists } from "./audio-library.mjs";
import { readJson, taskPaths, writeText } from "../project-fs.mjs";

export async function validateAudioAssets(taskId) {
  const paths = taskPaths(taskId);
  const plan = readJson(path.join(paths.planning, "audio_plan.json"), null);
  if (!plan) throw new Error("Missing planning/audio_plan.json. Run plan first.");
  const selected = [
    ...(plan.music || []),
    ...(plan.sfx || []),
    ...(plan.voice && plan.voice.asset_id !== "generated_voiceover" ? [plan.voice] : []),
  ];
  const missing = [];
  const warnings = [];
  for (const entry of selected) {
    const id = typeof entry === "string" ? entry : entry.asset_id;
    const asset = resolveAudioAsset(id);
    if (!asset) { missing.push({ asset_id: id, reason: "not in registry/audio.registry.json" }); continue; }
    if (!fileExists(asset)) missing.push({ asset_id: id, path: asset.path, reason: "file missing" });
    if (!asset.license_type || asset.license_type === "manual_review_required") warnings.push({ asset_id: id, reason: "license requires manual review" });
  }
  if (!selected.length && !plan.allow_silent_export) {
    missing.push({ asset_id: "music_or_silent_approval", reason: "No audio selected and allow_silent_export=false." });
  }
  if (missing.length) {
    const report = [
      `# Missing Audio Assets - ${taskId}`,
      "",
      "Collect or register the following before compile:",
      "",
      ...missing.map((m) => `- ${m.asset_id}: ${m.reason}${m.path ? ` (${m.path})` : ""}`),
      "",
      "Place manually collected files under `reference/audio` and update `registry/audio.registry.json`.",
    ].join("\n");
    await writeText(path.join(paths.logs, "missing-assets.md"), report);
  }
  return { task_id: taskId, valid: missing.length === 0, missing, warnings };
}

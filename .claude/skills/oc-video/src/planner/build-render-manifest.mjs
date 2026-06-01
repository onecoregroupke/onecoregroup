import fs from "node:fs";
import path from "node:path";
import { readJson, taskPaths, writeJson } from "../project-fs.mjs";

function sceneEntries(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /^scene_|^overlay_/.test(name))
    .sort()
    .map((name) => readJson(path.join(dir, name, "scene.json"), null))
    .filter(Boolean);
}

export async function buildRenderManifest(taskId) {
  const paths = taskPaths(taskId);
  const delivery = readJson(path.join(paths.planning, "delivery_manifest.json"), {});
  const motionPlan = readJson(path.join(paths.planning, "motion_plan.json"), null);
  const talkingPlan = readJson(path.join(paths.planning, "talking_head_plan.json"), null);
  const plan = motionPlan || talkingPlan || {};
  const audio = readJson(path.join(paths.planning, "audio_plan.json"), {});
  const voiceReport = readJson(path.join(paths.voice, "voice_report.json"), null);
  const voiceoverFile = path.join(paths.voice, "final_voiceover.wav");
  const voiceScriptExists = fs.existsSync(path.join(paths.voice, "script_segments.json"));
  const voiceover = voiceReport?.generated ? {
    enabled: true,
    file: voiceoverFile,
    voice_profile: voiceReport.voice_profile,
    provider: voiceReport.provider,
    priority: "primary",
    target_loudness_lufs: -16,
    duck_music_under_voice: true,
    duration_seconds: voiceReport.duration_seconds ?? null,
  } : { enabled: false, required: !!audio.voiceover_required || voiceScriptExists };
  const manifest = {
    task_id: taskId,
    mode: delivery.mode || plan.mode || "motion_graphics",
    brand: delivery.brand || "wmandco",
    format: plan.format || { width: 1920, height: 1080, fps: 30, aspect_ratio: "16:9" },
    source_video: talkingPlan?.source_video || null,
    scenes: sceneEntries(paths.scenes),
    overlays: sceneEntries(paths.overlays),
    captions: talkingPlan?.captions || null,
    audio: {
      voiceover,
      voice: audio.voice || null,
      music: audio.music || [],
      sfx: audio.sfx || [],
      target_loudness_lufs: audio.target_loudness_lufs ?? -14,
      true_peak_db: audio.true_peak_db ?? -1
    },
    exports: [
      { name: "draft", path: path.join(paths.exports, "draft.mp4") }
    ]
  };
  const file = path.join(paths.planning, "render_manifest.json");
  await writeJson(file, manifest);
  await writeJson(path.join(paths.planning, "asset_manifest.json"), {
    task_id: taskId,
        source_video: manifest.source_video,
        scenes: manifest.scenes.map((s) => s.scene_id),
        overlays: manifest.overlays.map((s) => s.scene_id),
        audio: manifest.audio,
        beat_timelines: manifest.scenes.map((s) => ({ scene_id: s.scene_id, path: `scenes/${s.scene_id}/beat_timeline.json` })),
        caption_timelines: manifest.scenes.map((s) => ({ scene_id: s.scene_id, path: `scenes/${s.scene_id}/caption_timeline.json` })),
        motion_timelines: manifest.scenes.map((s) => ({ scene_id: s.scene_id, path: `scenes/${s.scene_id}/motion_timeline.json` })),
        focus_timelines: manifest.scenes.map((s) => ({ scene_id: s.scene_id, path: `scenes/${s.scene_id}/focus_timeline.json` })),
        sfx_timelines: manifest.scenes.map((s) => ({ scene_id: s.scene_id, path: `scenes/${s.scene_id}/sfx_timeline.json` }))
      });
  return { path: file, manifest };
}

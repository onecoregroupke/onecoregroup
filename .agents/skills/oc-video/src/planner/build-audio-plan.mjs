import path from "node:path";
import { taskPaths, writeJson } from "../project-fs.mjs";

export async function buildAudioPlan(taskId) {
  const paths = taskPaths(taskId);
  const plan = {
    task_id: taskId,
    target_loudness_lufs: -14,
    true_peak_db: -1,
    allow_silent_export: false,
    voice: { asset_id: "generated_voiceover", role: "primary" },
    music: [
      { asset_id: "music_soundlings_i_love_what_you_do_to_me", role: "ducked_bed", default_volume_db: -25 }
    ],
    sfx: [
      { asset_id: "sfx_fast_swoosh_pack", role: "visual_focus_events", default_volume_db: -24 }
    ],
    voiceover_required: true,
    missing_policy: "fail_with_report",
    notes: "Add asset_ids from registry/audio.registry.json after user supplies approved audio."
  };
  const file = path.join(paths.planning, "audio_plan.json");
  await writeJson(file, plan);
  return { path: file, plan };
}

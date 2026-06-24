import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { audioRegistry } from "../audio/audio-library.mjs";
import { ensureDir, readJson, taskPaths, writeJson } from "../project-fs.mjs";

export const PLATFORM_SOUND_FILE = "platform_sounds.json";

export function taskSoundPaths(taskId) {
  const paths = taskPaths(taskId);
  return {
    platformSounds: path.join(paths.planning, PLATFORM_SOUND_FILE),
    handoff: path.join(paths.exports, "SOUND-HANDOFF.md"),
  };
}

export function readPlatformSounds(taskId) {
  return readJson(taskSoundPaths(taskId).platformSounds, { task_id: taskId, sounds: [] });
}

export async function savePlatformSound(taskId, sound) {
  const data = readPlatformSounds(taskId);
  const now = new Date().toISOString();
  const id = sound.id || `sound-${Date.now()}`;
  const normalized = {
    id,
    platform: sound.platform || "instagram",
    title: sound.title || "Untitled sound",
    creator: sound.creator || "",
    url: sound.url || "",
    start_time: sound.start_time || "0:00",
    suggested_volume: sound.suggested_volume || "native default",
    usage_mode: sound.usage_mode || "native_platform_sound",
    rights_status: sound.rights_status || "platform_native_only",
    notes: sound.notes || "",
    created_at: sound.created_at || now,
    updated_at: now,
  };
  const index = data.sounds.findIndex((item) => item.id === id);
  if (index >= 0) data.sounds[index] = normalized;
  else data.sounds.push(normalized);
  await writeJson(taskSoundPaths(taskId).platformSounds, data);
  return normalized;
}

export async function deletePlatformSound(taskId, id) {
  const data = readPlatformSounds(taskId);
  data.sounds = data.sounds.filter((item) => item.id !== id);
  await writeJson(taskSoundPaths(taskId).platformSounds, data);
  return data;
}

export function licensedAudioAssets() {
  return audioRegistry().map((asset) => ({
    asset_id: asset.asset_id,
    type: asset.type,
    category: asset.category,
    title: asset.title,
    artist_or_source: asset.artist_or_source || asset.source || "",
    path: asset.path,
    license_type: asset.license_type,
    allowed_platforms: asset.allowed_platforms || [],
    attribution_required: !!asset.attribution_required,
    attribution_text: asset.attribution_text || "",
    default_volume_db: asset.default_volume_db,
    notes: asset.notes || "",
    can_embed: asset.license_type && asset.license_type !== "manual_review_required",
  }));
}

export async function generateSoundHandoff(taskId) {
  const paths = taskPaths(taskId);
  const platform = readPlatformSounds(taskId);
  const audioPlan = readJson(path.join(paths.planning, "audio_plan.json"), {});
  const delivery = readJson(path.join(paths.planning, "delivery_manifest.json"), {});
  const lines = [
    `# Sound Handoff - ${taskId}`,
    "",
    "## Export Guidance",
    "",
    "- Use embedded audio exports only when every selected asset has been licensed or cleared.",
    "- Use platform-native sounds for TikTok/Instagram trends, commercial-library sounds, or sounds selected inside the app at posting time.",
    "- Do not download or embed arbitrary YouTube, TikTok, or Instagram audio unless rights are confirmed separately.",
    "",
    "## Platform-Native Sounds",
    "",
  ];

  if (!platform.sounds.length) {
    lines.push("- No platform-native sounds selected yet.", "");
  } else {
    for (const sound of platform.sounds) {
      lines.push(`### ${sound.title}`);
      lines.push("");
      lines.push(`- Platform: ${sound.platform}`);
      if (sound.creator) lines.push(`- Creator/source: ${sound.creator}`);
      if (sound.url) lines.push(`- URL: ${sound.url}`);
      lines.push(`- Start time: ${sound.start_time || "0:00"}`);
      lines.push(`- Suggested volume: ${sound.suggested_volume || "native default"}`);
      lines.push(`- Usage mode: ${sound.usage_mode || "native_platform_sound"}`);
      lines.push(`- Rights status: ${sound.rights_status || "platform_native_only"}`);
      if (sound.notes) lines.push(`- Notes: ${sound.notes}`);
      lines.push("");
    }
  }

  lines.push("## Embedded Audio Plan", "");
  if (audioPlan.music?.length) {
    lines.push("### Music", "");
    for (const item of audioPlan.music) {
      lines.push(`- ${item.asset_id}: ${item.path} (${item.default_volume_db ?? "default"} dB)`);
    }
    lines.push("");
  }
  if (audioPlan.sfx?.length) {
    lines.push("### SFX", "");
    for (const item of audioPlan.sfx) {
      lines.push(`- ${item.asset_id}: ${item.path} (${item.default_volume_db ?? "default"} dB)`);
    }
    lines.push("");
  }
  if (!audioPlan.music?.length && !audioPlan.sfx?.length) {
    lines.push("- No embedded audio selected.", "");
  }

  lines.push("## Delivery", "");
  lines.push(`- Delivery mode: ${delivery.delivery_mode || "not delivered"}`);
  lines.push(`- Delivery folder: ${delivery.delivery_folder || "not delivered"}`);
  lines.push(`- Status: ${delivery.status || "draft"}`);
  lines.push("");

  await ensureDir(paths.exports);
  await fsp.writeFile(taskSoundPaths(taskId).handoff, lines.join("\n"), "utf8");
  return { path: taskSoundPaths(taskId).handoff, content: lines.join("\n") };
}

export function taskList() {
  const root = path.join(path.dirname(taskPaths("TASK-0000").root), "");
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^TASK-\d{4,}$/.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

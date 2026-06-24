import fs from "node:fs";
import path from "node:path";
import { readJson, SKILL_ROOT } from "../project-fs.mjs";

export function voiceProfiles() {
  const dir = path.join(SKILL_ROOT, "reference", "voice", "profiles");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readJson(path.join(dir, name), null))
    .filter(Boolean);
}

export function resolveVoiceProfile(voiceId) {
  const profiles = voiceProfiles();
  const found = profiles.find((item) => item.voice_id === voiceId);
  const profile = found?.alias_for
    ? profiles.find((item) => item.voice_id === found.alias_for)
    : found;
  if (!profile) return null;
  return {
    ...profile,
    requested_voice_id: voiceId,
    absolute_model_path: (profile.voice_model || profile.voice_model_path)
      ? path.resolve(SKILL_ROOT, profile.voice_model || profile.voice_model_path)
      : null,
    absolute_config_path: profile.voice_config
      ? path.resolve(SKILL_ROOT, profile.voice_config)
      : null,
  };
}

export function validateVoiceBank() {
  const required = ["wm_voice_female", "wm_voice_male"];
  const profiles = voiceProfiles();
  const checks = required.map((voiceId) => {
    const profile = resolveVoiceProfile(voiceId);
    const model = profile?.absolute_model_path || null;
    const config = profile?.absolute_config_path || null;
    const source = profile ? path.resolve(SKILL_ROOT, "reference", "voice", "piper", "voices", voiceId, "source.md") : null;
    const license = profile ? path.resolve(SKILL_ROOT, "reference", "voice", "piper", "voices", voiceId, "license.md") : null;
    return {
      voice_id: voiceId,
      profile: !!profile,
      model,
      model_exists: !!model && fs.existsSync(model),
      config,
      config_exists: !!config && fs.existsSync(config),
      source_exists: !!source && fs.existsSync(source),
      license_exists: !!license && fs.existsSync(license),
      commercial_use_status: profile?.commercial_use_status || null,
    };
  });
  const aliases = ["wm_female_academy", "wm_male_strategy"].map((voiceId) => ({
    voice_id: voiceId,
    resolves_to: profiles.find((item) => item.voice_id === voiceId)?.alias_for || null,
  }));
  return {
    ok: checks.every((item) => item.profile && item.model_exists && item.config_exists && item.source_exists && item.license_exists),
    checks,
    aliases,
  };
}

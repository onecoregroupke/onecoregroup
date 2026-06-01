import fs from "node:fs";
import path from "node:path";
import { readJson, taskPaths, writeText } from "../project-fs.mjs";
import { providerFor, providerStatus } from "./voice-provider.mjs";
import { resolveVoiceProfile } from "./voice-library.mjs";
import { audioDurationSeconds } from "./voice-timing.mjs";

export async function validateVoiceAssets(taskId, flags = {}) {
  const paths = taskPaths(taskId);
  const report = readJson(path.join(paths.voice, "voice_report.json"), {});
  const voiceId = flags.voice || report?.voice_profile || "wm_voice_female";
  const profile = resolveVoiceProfile(voiceId);
  const finalVoiceover = path.join(paths.voice, "final_voiceover.wav");
  const missing = [];
  const warnings = [];
  if (!fs.existsSync(path.join(paths.voice, "script.md"))) missing.push("voice/script.md");
  if (!fs.existsSync(path.join(paths.voice, "script_segments.json"))) missing.push("voice/script_segments.json");
  if (!profile) missing.push(`voice profile ${voiceId}`);
  const providerName = flags.provider || report?.provider || profile?.provider;
  const status = profile && providerName
    ? await (providerFor(providerName)?.status({ ...profile, provider: providerName }) || providerStatus(profile))
    : { ok: false, error: "Profile missing" };
  if (profile && !status.ok && profile.provider !== "manual") warnings.push(status.error || "Voice provider unavailable");
  if (!fs.existsSync(finalVoiceover)) missing.push("voice/final_voiceover.wav");
  const duration = fs.existsSync(finalVoiceover) ? await audioDurationSeconds(finalVoiceover) : null;
  const valid = missing.length === 0;
  if (!valid) {
    await writeText(path.join(paths.logs, "missing-voiceover.md"), [
      `# Missing Voiceover Assets - ${taskId}`,
      "",
      "Voiceover is not ready for compile.",
      "",
      ...missing.map((item) => `- ${item}`),
      "",
      "Options:",
      "",
      "- Install/configure Piper and add a voice model under `reference/voice/piper/voices`.",
      "- Do not use Windows fallback voice. The WM voice bank is configured to fail closed.",
      "- For wm_voice_female place `voice.onnx` and `voice.onnx.json` under `reference/voice/piper/voices/wm_voice_female/`.",
      "- For wm_voice_male place `voice.onnx` and `voice.onnx.json` under `reference/voice/piper/voices/wm_voice_male/`.",
    ].join("\n"));
  }
  return {
    task_id: taskId,
    valid,
    voice_profile: voiceId,
    provider_status: status,
    final_voiceover: fs.existsSync(finalVoiceover),
    duration_seconds: duration,
    missing,
    warnings,
  };
}

import path from "node:path";
import { ensureDir, readJson, taskPaths, writeJson } from "../project-fs.mjs";
import { providerFor, providerStatus } from "./voice-provider.mjs";
import { resolveVoiceProfile } from "./voice-library.mjs";
import { audioDurationSeconds, combinedVoiceText, estimateSegmentsDuration } from "./voice-timing.mjs";

export async function generateVoiceover(taskId, flags = {}) {
  const paths = taskPaths(taskId);
  const voiceId = flags.voice || "wm_voice_female";
  const profile = resolveVoiceProfile(voiceId);
  if (!profile) throw new Error(`Voice profile not found: ${voiceId}`);
  const providerName = flags.provider || profile.provider;
  const provider = providerFor(providerName);
  if (!provider) throw new Error(`Unknown voice provider: ${providerName}`);
  const providerProfile = { ...profile, provider: providerName };
  const status = await providerStatus(providerProfile);
  if (!status.ok && providerName !== "manual") {
    await writeJson(path.join(paths.voice, "voice_report.json"), {
      task_id: taskId,
      voice_profile: voiceId,
      provider: providerName,
      generated: false,
      status,
    });
    await writeJson(path.join(paths.logs, "missing-voice-setup.json"), {
      task_id: taskId,
      voice_profile: voiceId,
      provider: providerName,
      status,
      required_files: [
        "tools/piper/piper.exe or PIPER_EXECUTABLE_PATH",
        profile.voice_model,
        profile.voice_config,
      ],
      fallback_system_voice_used: false,
    });
    throw new Error(status.error || `Voice provider unavailable: ${providerName}`);
  }
  const segmentFile = path.join(paths.voice, "script_segments.json");
  const segmentData = readJson(segmentFile, null);
  if (!segmentData?.segments?.length) throw new Error("Missing voice/script_segments.json. Run voice-script first.");
  await ensureDir(path.join(paths.voice, "generated"));
  const outputFile = path.join(paths.voice, "final_voiceover.wav");
  const result = await provider.synthesize({
    profile,
    text: combinedVoiceText(segmentData.segments),
    outputFile,
    sourceFile: flags.file || path.join(paths.voice, "manual.wav"),
  });
  const duration = await audioDurationSeconds(outputFile);
  const report = {
    task_id: taskId,
    voice_profile: voiceId,
    provider: providerName,
    generated: true,
    output_file: outputFile,
    duration_seconds: duration,
    target_duration_seconds: estimateSegmentsDuration(segmentData.segments),
    license_type: profile.license_type,
    commercial_use_status: profile.commercial_use_status,
    result,
  };
  await writeJson(path.join(paths.voice, "voice_report.json"), report);
  return report;
}

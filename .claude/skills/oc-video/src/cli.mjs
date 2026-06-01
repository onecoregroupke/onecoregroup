#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { initProject, projectDir, readJson, rel, SKILL_ROOT, taskPaths, writeJson } from "./project-fs.mjs";
import { populateTaskContext } from "./task-context.mjs";
import { createMotionPlan } from "./planner/create-motion-plan.mjs";
import { createTalkingHeadPlan } from "./planner/create-talking-head-plan.mjs";
import { buildAudioPlan } from "./planner/build-audio-plan.mjs";
import { buildRenderManifest } from "./planner/build-render-manifest.mjs";
import { generateMotionScenes } from "./generators/generate-motion-scenes.mjs";
import { generateOverlayScenes } from "./generators/generate-overlay-scenes.mjs";
import { renderScenes } from "./render/render-scenes.mjs";
import { renderOverlays } from "./render/render-overlays.mjs";
import { validateAudioAssets } from "./audio/validate-audio-assets.mjs";
import { createVoiceScript } from "./voice/voice-script.mjs";
import { generateVoiceover } from "./voice/generate-voiceover.mjs";
import { validateVoiceAssets } from "./voice/validate-voice-assets.mjs";
import { resolveVoiceProfile, validateVoiceBank, voiceProfiles } from "./voice/voice-library.mjs";
import { providerFor, providerStatus } from "./voice/voice-provider.mjs";
import { compileMotionVideo } from "./ffmpeg/compile-motion-video.mjs";
import { compileTalkingHeadVideo } from "./ffmpeg/compile-talking-head-video.mjs";
import { alignVoice } from "./align/align-voice.mjs";
import { analyzeReference } from "./reference/analyze-reference.mjs";
import { createEditPlan } from "./planner/create-edit-plan.mjs";
import { transcribeSource } from "./edit/transcribe-source.mjs";
import { runBuildEdl } from "./edit/run-build-edl.mjs";
import { renderEdit } from "./edit/render-edit.mjs";
import { uploadArtifact } from "./delivery/upload-artifact.mjs";
import { deliverLocal } from "./delivery/delivery-summary.mjs";
import { updateTaskDraftReady } from "./delivery/update-task-status.mjs";
import { doctor } from "./ffmpeg/ffmpeg-utils.mjs";
import { startAudioConsole } from "./audio-console/server.mjs";

function parse(argv) {
  const positionals = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > -1) { flags[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      const k = a.slice(2);
      const n = argv[i + 1];
      if (!n || n.startsWith("--")) flags[k] = true;
      else { flags[k] = n; i++; }
    } else positionals.push(a);
  }
  return { positionals, flags };
}

function ok(obj) {
  console.log(JSON.stringify({ ok: true, ...obj }, null, 2));
}

function fail(error, extra = {}) {
  console.log(JSON.stringify({ ok: false, error: String(error), ...extra }, null, 2));
  process.exitCode = 1;
}

function needTask(flags) {
  if (!flags.task) throw new Error("--task TASK-XXXX is required");
  return flags.task;
}

async function status(taskId) {
  const paths = taskPaths(taskId);
  const exists = (p) => fs.existsSync(p);
  const count = (dir, rx = /.*/) => exists(dir) ? fs.readdirSync(dir).filter((f) => rx.test(f)).length : 0;
  const delivery = readJson(path.join(paths.planning, "delivery_manifest.json"), {});
  const audioPlan = readJson(path.join(paths.planning, "audio_plan.json"), null);
  const voiceReport = readJson(path.join(paths.voice, "voice_report.json"), null);
  const selectedAudioCount = audioPlan ? [
    ...(audioPlan.music || []),
    ...(audioPlan.sfx || []),
    ...(audioPlan.voice ? [audioPlan.voice] : []),
  ].length : 0;
  const sceneDirs = fs.existsSync(paths.scenes) ? fs.readdirSync(paths.scenes).filter((f) => f.startsWith("scene_")).sort() : [];
  const timelineStatus = sceneDirs.map((sceneId) => {
    const sceneMeta = readJson(path.join(paths.scenes, sceneId, "scene.json"), {});
    const frameDir = path.join(paths.frames, sceneId);
    const frameCount = fs.existsSync(frameDir) ? fs.readdirSync(frameDir).filter((f) => /^frame-\d+\.png$/.test(f)).length : 0;
    const expectedFrames = Math.round((sceneMeta.duration_seconds || 0) * (sceneMeta.fps || 30));
    return {
      scene_id: sceneId,
      motion_timeline: exists(path.join(paths.scenes, sceneId, "motion_timeline.json")),
      focus_timeline: exists(path.join(paths.scenes, sceneId, "focus_timeline.json")),
      sfx_timeline: exists(path.join(paths.scenes, sceneId, "sfx_timeline.json")),
      beat_timeline: exists(path.join(paths.scenes, sceneId, "beat_timeline.json")),
      caption_timeline: exists(path.join(paths.scenes, sceneId, "caption_timeline.json")),
      frames: frameCount,
      expected_frames: expectedFrames,
      frames_complete: expectedFrames > 0 && frameCount >= expectedFrames,
    };
  });
  return {
    task_id: taskId,
    root: paths.root,
    exists: exists(paths.root),
    context: {
      task_context: exists(path.join(paths.context, "task_context.json")),
      project_context: exists(path.join(paths.context, "project_context.json")),
      brand_context: exists(path.join(paths.context, "brand_context.json")),
    },
    planning: {
      motion_plan: exists(path.join(paths.planning, "motion_plan.json")),
      talking_head_plan: exists(path.join(paths.planning, "talking_head_plan.json")),
      audio_plan: exists(path.join(paths.planning, "audio_plan.json")),
      render_manifest: exists(path.join(paths.planning, "render_manifest.json")),
      asset_manifest: exists(path.join(paths.planning, "asset_manifest.json")),
      delivery_manifest: exists(path.join(paths.planning, "delivery_manifest.json")),
    },
    assets: {
      scenes: count(paths.scenes, /^scene_/),
      overlays: count(paths.overlays, /^overlay_/),
      frames: count(paths.frames),
      exports: count(paths.exports),
      logs: count(paths.logs),
    },
    audio: {
      plan_exists: !!audioPlan,
      selected_assets: selectedAudioCount,
      allow_silent_export: !!audioPlan?.allow_silent_export,
      missing_assets_report: exists(path.join(paths.logs, "missing-assets.md")),
    },
    voiceover: {
      script: exists(path.join(paths.voice, "script.md")),
      segments: exists(path.join(paths.voice, "script_segments.json")),
      final_voiceover: exists(path.join(paths.voice, "final_voiceover.wav")),
      voice_report: !!voiceReport,
      voice_profile: voiceReport?.voice_profile || null,
      provider: voiceReport?.provider || null,
      duration_seconds: voiceReport?.duration_seconds ?? null,
      final_mix: exists(path.join(paths.audio, "final_mix", "final_mix.wav")),
      missing_voiceover_report: exists(path.join(paths.logs, "missing-voiceover.md")),
    },
    motion: {
      scenes: timelineStatus,
      all_have_motion_timeline: timelineStatus.every((s) => s.motion_timeline),
      all_have_focus_timeline: timelineStatus.every((s) => s.focus_timeline),
      all_have_sfx_timeline: timelineStatus.every((s) => s.sfx_timeline),
      all_have_beat_timeline: timelineStatus.every((s) => s.beat_timeline),
      all_have_caption_timeline: timelineStatus.every((s) => s.caption_timeline),
      all_frames_complete: timelineStatus.length > 0 && timelineStatus.every((s) => s.frames_complete),
      mapped_sfx_assets: timelineStatus.length > 0 && timelineStatus.every((s) => s.sfx_timeline),
    },
    delivery,
  };
}

async function validate(taskId) {
  const s = await status(taskId);
  const missing = [];
  if (!s.exists) missing.push("project folder");
  for (const [k, v] of Object.entries(s.context)) if (!v) missing.push(`context/${k}`);
  if (!s.planning.audio_plan) missing.push("planning/audio_plan.json");
  if (!s.planning.render_manifest) missing.push("planning/render_manifest.json");
  if (s.assets.scenes > 0 && !s.motion.all_have_motion_timeline) missing.push("motion_timeline.json for every scene");
  if (s.assets.scenes > 0 && !s.motion.all_have_focus_timeline) missing.push("focus_timeline.json for every scene");
  if (s.assets.scenes > 0 && !s.motion.all_have_sfx_timeline) missing.push("sfx_timeline.json for every scene");
  if (s.assets.scenes > 0 && !s.motion.all_have_beat_timeline) missing.push("beat_timeline.json for every scene");
  if (s.assets.scenes > 0 && !s.motion.all_have_caption_timeline) missing.push("caption_timeline.json for every scene");
  let audio = null;
  if (s.planning.audio_plan) {
    audio = await validateAudioAssets(taskId);
    if (!audio.valid) missing.push("valid audio assets or allow_silent_export=true");
  }
  let voice = null;
  if (s.voiceover.script || s.voiceover.segments || s.voiceover.voice_report || s.voiceover.final_voiceover) {
    voice = await validateVoiceAssets(taskId);
    if (!voice.valid) missing.push("valid voiceover assets");
  }
  return { valid: missing.length === 0, missing, audio, voice, status: await status(taskId) };
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  const { flags } = parse(rest);
  try {
    switch (cmd) {
      case "init": {
        const taskId = needTask(flags);
        const mode = flags.mode || "motion_graphics";
        const brand = flags.brand || "wmandco";
        const root = await initProject({ taskId, mode, brand });
        const ctx = await populateTaskContext(taskId);
        ok({ task_id: taskId, mode, brand, root, context: ctx.ok ? "fetched" : ctx.error });
        break;
      }
      case "plan": {
        const taskId = needTask(flags);
        const delivery = readJson(path.join(projectDir(taskId), "planning", "delivery_manifest.json"), {});
        const mode = flags.mode || delivery.mode || "motion_graphics";
        if (mode === "edit") {
          const plan = await createEditPlan(taskId, flags);
          ok({ task_id: taskId, mode, plan: rel(plan.path), source: plan.plan.source_video, duration: plan.plan.source_duration_seconds });
          break;
        }
        const plan = mode === "talking_head" ? await createTalkingHeadPlan(taskId) : await createMotionPlan(taskId);
        const audio = await buildAudioPlan(taskId);
        ok({ task_id: taskId, mode, plan: rel(plan.path), audio_plan: rel(audio.path) });
        break;
      }
      case "generate-scenes": {
        const taskId = needTask(flags);
        const delivery = readJson(path.join(projectDir(taskId), "planning", "delivery_manifest.json"), {});
        const out = delivery.mode === "talking_head" ? await generateOverlayScenes(taskId) : await generateMotionScenes(taskId);
        ok({ task_id: taskId, generated: out });
        break;
      }
      case "render-scenes": {
        const taskId = needTask(flags);
        const delivery = readJson(path.join(projectDir(taskId), "planning", "delivery_manifest.json"), {});
        const out = delivery.mode === "talking_head" ? await renderOverlays(taskId, flags) : await renderScenes(taskId, flags);
        ok({ task_id: taskId, rendered: out });
        break;
      }
      case "validate-audio": {
        const taskId = needTask(flags);
        ok(await validateAudioAssets(taskId));
        break;
      }
      case "voice-script": {
        const taskId = needTask(flags);
        ok({ task_id: taskId, voice_script: await createVoiceScript(taskId) });
        break;
      }
      case "generate-voice": {
        const taskId = needTask(flags);
        ok({ task_id: taskId, voiceover: await generateVoiceover(taskId, flags) });
        break;
      }
      case "list-voices": {
        ok({
          voices: voiceProfiles().map((profile) => ({
            voice_id: profile.voice_id,
            name: profile.name || profile.voice_id,
            provider: profile.provider || null,
            alias_for: profile.alias_for || null,
            deprecated: !!profile.deprecated,
            commercial_use_status: profile.commercial_use_status || null,
          })),
        });
        break;
      }
      case "validate-voice-bank": {
        ok(validateVoiceBank());
        break;
      }
      case "audition-voice": {
        const voiceId = flags.voice || "wm_voice_female";
        const text = flags.text || "Welcome to WM Academy.";
        const profile = resolveVoiceProfile(voiceId);
        if (!profile) throw new Error(`Voice profile not found: ${voiceId}`);
        const provider = providerFor(profile.provider);
        if (!provider) throw new Error(`Unknown voice provider: ${profile.provider}`);
        const status = await providerStatus(profile);
        if (!status.ok) throw new Error(status.error || `Voice provider unavailable: ${profile.provider}`);
        const sampleDir = path.join(SKILL_ROOT, "reference", "voice", "piper", "voices", profile.voice_id);
        const outputFile = path.join(sampleDir, "sample.wav");
        await provider.synthesize({ profile, text, outputFile });
        ok({ voice_id: voiceId, output_file: rel(outputFile), provider_status: status });
        break;
      }
      case "validate-voice": {
        const taskId = needTask(flags);
        ok(await validateVoiceAssets(taskId, flags));
        break;
      }
      case "voice-report": {
        const taskId = needTask(flags);
        ok({ task_id: taskId, voice_report: readJson(path.join(taskPaths(taskId).voice, "voice_report.json"), null) });
        break;
      }
      case "align-voice": {
        const taskId = needTask(flags);
        ok({ task_id: taskId, align: await alignVoice(taskId, flags) });
        break;
      }
      case "transcribe-source": {
        const taskId = needTask(flags);
        ok({ task_id: taskId, transcribe: await transcribeSource(taskId, flags) });
        break;
      }
      case "build-edl": {
        const taskId = needTask(flags);
        ok({ task_id: taskId, build_edl: await runBuildEdl(taskId, flags) });
        break;
      }
      case "reference": {
        const taskId = needTask(flags);
        ok({ task_id: taskId, reference: await analyzeReference(taskId, flags) });
        break;
      }
      case "build-manifest": {
        const taskId = needTask(flags);
        const manifest = await buildRenderManifest(taskId);
        ok({ task_id: taskId, render_manifest: rel(manifest.path) });
        break;
      }
      case "compile": {
        const taskId = needTask(flags);
        const delivery = readJson(path.join(projectDir(taskId), "planning", "delivery_manifest.json"), {});
        const out = delivery.mode === "talking_head" ? await compileTalkingHeadVideo(taskId, flags)
          : delivery.mode === "edit" ? await renderEdit(taskId, flags)
          : await compileMotionVideo(taskId, flags);
        ok({ task_id: taskId, compile: out });
        break;
      }
      case "upload": {
        const taskId = needTask(flags);
        ok(await uploadArtifact(taskId, flags));
        break;
      }
      case "deliver": {
        const taskId = needTask(flags);
        const delivered = await deliverLocal(taskId, flags);
        if (!flags["dry-run"] && delivered.ok) await updateTaskDraftReady(taskId, delivered.summary);
        ok(delivered);
        break;
      }
      case "status": {
        ok(await status(needTask(flags)));
        break;
      }
      case "validate": {
        ok(await validate(needTask(flags)));
        break;
      }
      case "doctor": {
        ok(await doctor());
        break;
      }
      case "audio-console": {
        const launched = await startAudioConsole(flags);
        console.log(JSON.stringify({ ok: true, url: launched.url }, null, 2));
        console.log("Press Ctrl+C to stop the audio console.");
        break;
      }
      default:
        console.log(`wm-video commands: init, plan, generate-scenes, align-voice, reference, transcribe-source, build-edl, render-scenes, voice-script, generate-voice, list-voices, validate-voice-bank, audition-voice, validate-voice, voice-report, validate-audio, build-manifest, compile, upload, deliver, status, validate, doctor, audio-console`);
        process.exitCode = cmd ? 1 : 0;
    }
  } catch (e) {
    fail(e?.message || e);
  }
}

main();

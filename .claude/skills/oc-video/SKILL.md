---
name: oc-video
description: Code-native One Core Group video production for the Ops Hub. Use when Codex, Hermes, or Claude Code needs to create motion-graphics videos, reels, video overlays, transparent graphics, talking-head enhancements, captions, audio mixes, FFmpeg renders, or draft video deliverables for an OCG TASK-XXXX (across the 6 brands). Uses HTML/CSS/SVG/JS, local Chrome/Chromium, FFmpeg, manually supplied audio, and oc-ops/Ops Hub delivery. Never use Canva, AI image generation, AI video generation, automatic publishing, or external sending.
---

# OC Video

Code-native video production for One Core Group. Produce local draft artifacts and deliver them through the **Ops Hub** task lifecycle via the **oc-ops** skill. Adapted from the WM & Co `wm-video` skill; configured for OCG's 6 brands.

**Model note:** this skill is executed by the orchestrating agent (Codex / Hermes / Claude Code) using the best available model — NOT by Groq. Groq is reserved for the Ops Hub's automated daily/weekly/monthly report narration only.

## Brands

`nairobi-piano-technicians` · `glitz-n-glim` · `nuuranest-stays` · `ar-rayyan-playhouse` · `rhythms-college` · `darul-swafa`
Each has a profile under `reference/brands/<slug>/brand.json` (+ shared motion/caption styles in `reference/brands/_shared/`).

## Operating Rule

Use the CLI as the source of truth:

```bash
node .claude/skills/oc-video/src/cli.mjs <command> [options]
```

All agents must use the same project folder, manifests, logs, and commands. Do not bypass the CLI unless repairing the skill itself.

## Modes

- `motion_graphics`: A complete animated video with code-native scenes, rendered frames, music/SFX, and FFmpeg compilation.
- `motion_graphics` with voiceover: Narrated explainers/lessons with generated (Piper) or manual narration.
- `talking_head`: Enhance a source video with captions, overlays, voice cleanup, music ducking, SFX, FFmpeg compilation.
- `edit`: General transcript-driven editor for ANY source video — auto-cut (silences + filler words via a reviewable EDL), burn synced captions, reframe (16:9 ↔ 9:16 ↔ 1:1 ↔ 4:5), loudness-normalize.

## Core Workflow

```bash
node .claude/skills/oc-video/src/cli.mjs init --task TASK-XXXX --mode motion_graphics --brand glitz-n-glim
node .claude/skills/oc-video/src/cli.mjs plan --task TASK-XXXX
node .claude/skills/oc-video/src/cli.mjs voice-script --task TASK-XXXX
node .claude/skills/oc-video/src/cli.mjs generate-voice --task TASK-XXXX --voice wm_voice_female
node .claude/skills/oc-video/src/cli.mjs align-voice --task TASK-XXXX
node .claude/skills/oc-video/src/cli.mjs generate-scenes --task TASK-XXXX
node .claude/skills/oc-video/src/cli.mjs render-scenes --task TASK-XXXX
node .claude/skills/oc-video/src/cli.mjs build-manifest --task TASK-XXXX
node .claude/skills/oc-video/src/cli.mjs compile --task TASK-XXXX
node .claude/skills/oc-video/src/cli.mjs deliver --task TASK-XXXX
```

Edit mode and reference-video understanding (`reference`, `transcribe-source`, `build-edl`) work as in the upstream skill. Transcription/alignment uses **faster-whisper** (lightweight — no torch/WhisperX; set up via `scripts/setup-video-env.ps1`). Run `doctor` to confirm Chrome/FFmpeg/Python(faster-whisper) readiness. See the inline command help and the timeline/voice rules below.

## Delivery (OCG)

Video files are large, so delivery is **local Drive-sync first, then Ops Hub link**:
1. Render locally; copy the export into the synced OCG delivery folder (the Ops Hub's connected Google Drive `One Core Group — Ops Deliverables/<Brand>/<PROJ-XXX …>/`, or `OCG_LOCAL_DELIVERY_ROOT` if you sync locally).
2. Then register the deliverable with Ops via **oc-ops**:
   ```bash
   node scripts/oc-ops.mjs submit-artifact --task TASK-XXXX --specialist video_clipping \
     --title "<Brand> — <piece>" --content-file <delivery-summary.md> --summary "Video draft delivered: <link>"
   ```
   That flips the task to `AI Draft Ready`. The Ops Hub callback then returns the deliverable to the Content Calendar (if the task came from a content row) and auto-schedules.

Config: `config/taskops.config.json` points at the Ops Hub `/api/agent/*` endpoints (`OPS_OPS_BASE_URL` + `OPS_AGENT_API_KEY`, header `x-ops-agent-key`). Set `OCG_LOCAL_DELIVERY_ROOT` if delivering through a locally-synced Drive folder.

## Visual / Audio / Voice Rules

- Visuals only as HTML/CSS/SVG/JS, rendered with local Chrome/Chromium; support PNG, frame sequences, transparent overlays, 1920×1080, 1080×1920, 1080×1350, 30fps. No Canva / AI image / AI video generation.
- Animate individual elements (per-scene `motion_timeline.json` / `focus_timeline.json` / `sfx_timeline.json`, deterministic `window.renderAt(seconds)`). Use ease-out `cubic-bezier(0.22,1,0.36,1)`, ~0.15s stagger, restrained premium motion.
- Music/SFX are **manually supplied** by the user in `reference/audio`; validate paths + license before compile. Target −14 LUFS / −1 dBTP; duck music under voice.
- Voiceover via Piper (`wm_voice_female` / `wm_voice_male` — the bundled neutral voices, `manual_review_required` for external commercial use; add OCG brand voices later). Never fake voice; fail clearly if Piper/models are missing.

## Task Lifecycle

Draft-only. Never publish, never send external messages, never mark `Completed`. Successful delivery sets/recommends `AI Draft Ready`; a human approves in the Ops Hub.

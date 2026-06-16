# OC Video

`oc-video` is a code-native video production toolkit for One Core Group Task Ops. It creates motion graphics and talking-head video drafts using HTML/CSS/SVG/JS, Chrome frame rendering, FFmpeg compilation, manual audio assets, and local Drive-sync delivery.

## Prerequisites

- Node.js 18+
- Google Chrome or Chromium
- FFmpeg and FFprobe
- Local Drive sync root for One Core Group delivery folders
- Optional Task Ops credentials for context/status updates

## Install

Use the skill folder directly:

```bash
cd F:\Cognexa Co\02_CODE\CLIENT-IMPLS\ONE CORE GROUP\One Core Group Marketing Admin\one-core-group\.claude\skills\oc-video
node src/cli.mjs doctor
```

When working from this repo, use `.claude/skills/oc-video` directly. Copy `.env.example` to `.env` or configure the same values in the repo `.env.local`.

## Project Flow

```bash
node src/cli.mjs init --task TASK-XXXX --mode motion_graphics --brand wmandco
node src/cli.mjs plan --task TASK-XXXX
node src/cli.mjs voice-script --task TASK-XXXX
node src/cli.mjs generate-voice --task TASK-XXXX --voice wm_academy_narrator
node src/cli.mjs generate-scenes --task TASK-XXXX
node src/cli.mjs validate-voice --task TASK-XXXX
node src/cli.mjs render-scenes --task TASK-XXXX
node src/cli.mjs validate-audio --task TASK-XXXX
node src/cli.mjs build-manifest --task TASK-XXXX
node src/cli.mjs compile --task TASK-XXXX --dry-run
node src/cli.mjs compile --task TASK-XXXX
node src/cli.mjs deliver --task TASK-XXXX --dry-run
node src/cli.mjs deliver --task TASK-XXXX
```

Motion graphics mode is expected to create true element-level animation. Each production scene should include:

- `index.html`
- `styles.css`
- `animation.js`
- `scene.json`
- `motion_timeline.json`
- `sfx_timeline.json`

The renderer should capture frame sequences for animated scenes, not only static screenshots. `status` reports whether timelines exist and whether the expected frame count has been rendered.

## Voiceover

`oc-video` supports a CLI-first voiceover layer for OCG lessons, explainers, campaign videos, and training videos.

Commands:

```bash
node src/cli.mjs voice-script --task TASK-XXXX
node src/cli.mjs generate-voice --task TASK-XXXX --voice wm_academy_narrator
node src/cli.mjs generate-voice --task TASK-XXXX --voice wm_academy_narrator --provider manual --file C:\path\to\narration.wav
node src/cli.mjs validate-voice --task TASK-XXXX
node src/cli.mjs voice-report --task TASK-XXXX
```

Voice files live in `projects/TASK-XXXX/voice`:

- `script.md`
- `script_segments.json`
- `generated/`
- `final_voiceover.wav`
- `voice_report.json`

Providers:

- `piper`: default local/free provider. Install Piper, then place an approved `.onnx` model in `reference/voice/piper/voices` or set `PIPER_VOICE_MODEL`.
- `manual`: use a pre-recorded WAV/MP3 file with `--provider manual --file ...`.
- `melotts`: scaffolded for a later local/open implementation.
- `external_api`: scaffold-only. No paid API provider is default.

When voiceover exists, `build-manifest` adds `audio.voiceover`, `compile` creates `audio/final_mix/final_mix.wav`, music is ducked under the voice, and the final MP4 is muxed with the voice-first mix. If voiceover is required but missing, compile stops and writes a clear missing voiceover report through validation.

## Audio Registration

Add user-collected music and SFX to `reference/audio`, then add metadata records in `registry/audio.registry.json`. Keep `license_type`, `source_url`, allowed platforms, and attribution fields honest. Do not scrape or auto-download audio.

## Audio Console

Launch the local browser interface for platform sound planning and licensed audio review:

```bash
node src/cli.mjs audio-console --task TASK-0107
```

The console separates two workflows:

- Platform-native sounds: TikTok, Instagram, Meta, YouTube, or commercial-library links saved as posting handoff notes. These are not embedded into MP4 exports unless rights are confirmed elsewhere.
- Licensed embedded audio: local registry assets in `reference/audio` that can be mixed into a video after license metadata is reviewed.

The console can generate `projects/TASK-XXXX/exports/SOUND-HANDOFF.md`, which travels with the draft and tells the poster which native platform sound to use, exact links, start points, and volume notes. YouTube search is metadata/reference-only; it does not download arbitrary YouTube audio.

## Delivery

Default delivery is local Drive sync:

1. Compile final draft into `projects/TASK-XXXX/exports`.
2. Copy exports and summaries into the synced project `03_Working-Files` folder.
3. Attach a Task Ops context note when credentials are available.
4. Set or recommend `AI Draft Ready`.
5. Include the actual deliverable location in the chat response.

If Drive sync is unavailable, delivery falls back to `projects/TASK-XXXX/03_Working-Files` and records that local path in the delivery manifest. The `upload` command is now best treated as Task Ops registration for a local media path, not as a binary media upload.

## First Test Later

Do not run a first creative test until a real TASK-XXXX is chosen and audio assets have been collected or the plan explicitly allows silent output.

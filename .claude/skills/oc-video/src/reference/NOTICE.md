# Attribution

The reference-video analysis (`src/reference/analyze-reference.mjs` and
`scripts/reference_analyze.py`) adapts ideas and the duration-aware frame-budget
logic from:

- **claude-video / `/watch`** by bradautomates — https://github.com/bradautomates/claude-video — MIT License.

What we reused: the yt-dlp ingest pattern, the auto-fps frame-budget approach
(caps: ~2 fps, budget by duration), and the "extract frames + timestamped
transcript, then let the model read them" pattern.

What we changed / added: structured `style_profile.json` output (shots via
PySceneDetect, pacing metrics, palette via ffmpeg), local WhisperX word-level
transcript (instead of Whisper API), and integration with the wm-video Task Ops
project structure and brand-locked, draft-only governance.

claude-video is MIT licensed; this adaptation preserves that attribution.

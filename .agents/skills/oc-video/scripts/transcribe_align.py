#!/usr/bin/env python3
"""Word-level transcription for wm-video (narration alignment + edit-mode EDL).

Uses faster-whisper (CTranslate2) — no PyTorch, no pyannote — so it installs in
a few hundred MB and runs offline on CPU. Emits JSON on stdout:

    {"ok": true, "language": "en", "model": "small", "duration": 12.3,
     "words": [{"word": "...", "start": 1.23, "end": 1.55}, ...],
     "segments": [{"start":..,"end":..,"text":".."}, ...]}

faster-whisper decodes audio from any media file (incl. .mp4) via PyAV, so the
same script serves narration WAVs and source videos.

Usage:
    python transcribe_align.py <audio-or-video> [--language en] [--model small]
                               [--device cpu] [--compute-type int8]
"""
from __future__ import annotations

import argparse
import json
import sys


def fail(msg: str, code: int = 1):
    print(json.dumps({"ok": False, "error": msg}), flush=True)
    sys.exit(code)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("media")
    ap.add_argument("--language", default="en")
    ap.add_argument("--model", default="small")
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--compute-type", default="int8")
    args = ap.parse_args()

    try:
        from faster_whisper import WhisperModel  # type: ignore
    except Exception as e:  # noqa: BLE001
        fail(f"faster-whisper import failed ({e}). Install it in the wm-video .venv: "
             f"pip install faster-whisper (Python 3.11/3.12).", code=3)

    try:
        model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)
        segments, info = model.transcribe(
            args.media,
            language=args.language,
            word_timestamps=True,
            vad_filter=True,
        )
        words = []
        segs = []
        for seg in segments:  # generator — iterating runs the transcription
            segs.append({
                "start": round(float(seg.start), 3) if seg.start is not None else None,
                "end": round(float(seg.end), 3) if seg.end is not None else None,
                "text": (seg.text or "").strip(),
            })
            for w in (seg.words or []):
                if w.start is None or w.end is None:
                    continue
                words.append({
                    "word": (w.word or "").strip(),
                    "start": round(float(w.start), 3),
                    "end": round(float(w.end), 3),
                })
        print(json.dumps({
            "ok": True,
            "engine": "faster-whisper",
            "language": getattr(info, "language", args.language),
            "model": args.model,
            "duration": round(float(getattr(info, "duration", 0.0)), 3) or None,
            "words": words,
            "segments": segs,
        }), flush=True)
    except Exception as e:  # noqa: BLE001
        fail(f"transcription failed: {e}", code=4)


if __name__ == "__main__":
    main()

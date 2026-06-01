#!/usr/bin/env python3
"""Word-level alignment for wm-video narration.

Transcribes a narration WAV with faster-whisper (via WhisperX) and runs the
WhisperX forced aligner to get word-level timestamps. Emits JSON on stdout:

    {"words": [{"word": "...", "start": 1.23, "end": 1.55}, ...],
     "segments": [...], "language": "en", "duration": 12.3}

Runs inside the pinned .venv (Python 3.11/3.12). Fails clearly if whisperx is
not installed — never fabricates timings.

Usage:
    python whisperx_align.py <audio.wav> [--language en] [--model small] [--device cpu]
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
    ap.add_argument("audio")
    ap.add_argument("--language", default="en")
    ap.add_argument("--model", default="small")
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--compute-type", default="int8")
    args = ap.parse_args()

    try:
        import whisperx  # type: ignore
    except Exception as e:  # noqa: BLE001
        fail(f"whisperx import failed ({e}). Install it in the wm-video .venv: "
             f"pip install whisperx (Python 3.11/3.12).", code=3)

    try:
        model = whisperx.load_model(args.model, args.device, compute_type=args.compute_type, language=args.language)
        audio = whisperx.load_audio(args.audio)
        result = model.transcribe(audio, language=args.language)

        align_model, metadata = whisperx.load_align_model(language_code=args.language, device=args.device)
        aligned = whisperx.align(result["segments"], align_model, metadata, audio, args.device, return_char_alignments=False)

        words = []
        for seg in aligned.get("segments", []):
            for w in seg.get("words", []):
                if w.get("start") is None or w.get("end") is None:
                    continue
                words.append({
                    "word": w.get("word", "").strip(),
                    "start": round(float(w["start"]), 3),
                    "end": round(float(w["end"]), 3),
                })

        duration = round(float(len(audio)) / 16000.0, 3) if hasattr(audio, "__len__") else None
        print(json.dumps({
            "ok": True,
            "language": args.language,
            "model": args.model,
            "duration": duration,
            "words": words,
            "segments": [
                {"start": s.get("start"), "end": s.get("end"), "text": s.get("text", "").strip()}
                for s in aligned.get("segments", [])
            ],
        }), flush=True)
    except Exception as e:  # noqa: BLE001
        fail(f"alignment failed: {e}", code=4)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Analyze a reference video into a structured style profile for wm-video.

Pipeline: ingest (yt-dlp for URLs, local file otherwise) -> ffprobe metadata
-> shot detection (PySceneDetect) -> budgeted frame extraction (ffmpeg) ->
palette (ffmpeg palettegen) -> optional transcript (WhisperX) -> writes
`style_profile.json` plus frame JPEGs the model can Read.

This produces INSPIRATION (pacing, shot rhythm, palette, on-screen cadence) —
it never copies a competitor's footage. Honest about missing deps: it records
warnings and continues with whatever is available, rather than faking data.

Frame-budget logic adapted from bradautomates/claude-video (MIT). See NOTICE.md.

Usage:
    python reference_analyze.py <url-or-path> --out DIR [--max-frames 60] [--no-whisper]
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

MAX_FPS = 2.0


def run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True)


def is_url(s: str) -> bool:
    return s.startswith("http://") or s.startswith("https://")


def ingest(source: str, out_dir: Path, warnings: list[str]) -> str | None:
    if not is_url(source):
        p = Path(source)
        if not p.exists():
            print(json.dumps({"ok": False, "error": f"source not found: {source}"}))
            sys.exit(2)
        return str(p.resolve())
    if shutil.which("yt-dlp") is None:
        warnings.append("yt-dlp not installed; cannot download URL. Install yt-dlp in the .venv.")
        return None
    target = out_dir / "source.%(ext)s"
    res = run(["yt-dlp", "-f", "mp4/best", "-o", str(target), source])
    if res.returncode != 0:
        warnings.append(f"yt-dlp failed: {res.stderr.strip()[:300]}")
        return None
    files = sorted(out_dir.glob("source.*"))
    return str(files[0]) if files else None


def ffprobe_meta(video: str) -> dict:
    res = run(["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", video])
    data = json.loads(res.stdout or "{}")
    streams = data.get("streams", [])
    fmt = data.get("format", {})
    v = next((s for s in streams if s.get("codec_type") == "video"), {})
    a = next((s for s in streams if s.get("codec_type") == "audio"), None)
    return {
        "duration_seconds": float(fmt.get("duration") or v.get("duration") or 0),
        "width": v.get("width"), "height": v.get("height"),
        "fps": _eval_fps(v.get("r_frame_rate")), "codec": v.get("codec_name"),
        "has_audio": a is not None,
    }


def _eval_fps(r: str | None) -> float | None:
    if not r or "/" not in str(r):
        return None
    try:
        n, d = str(r).split("/"); return round(float(n) / float(d), 3) if float(d) else None
    except Exception:  # noqa: BLE001
        return None


def detect_shots(video: str, warnings: list[str]) -> list[dict]:
    try:
        from scenedetect import detect, ContentDetector  # type: ignore
    except Exception as e:  # noqa: BLE001
        warnings.append(f"pyscenedetect unavailable ({e}); shot detection skipped.")
        return []
    try:
        scenes = detect(video, ContentDetector())
        return [
            {"index": i, "start": round(s.get_seconds(), 3), "end": round(e.get_seconds(), 3),
             "duration": round(e.get_seconds() - s.get_seconds(), 3)}
            for i, (s, e) in enumerate(scenes)
        ]
    except Exception as e:  # noqa: BLE001
        warnings.append(f"scene detection failed: {e}")
        return []


def auto_fps(duration: float, max_frames: int) -> tuple[float, int]:
    if duration <= 0:
        return 1.0, 1
    if duration <= 30:
        target = min(max_frames, max(12, int(round(duration))))
    elif duration <= 60:
        target = min(max_frames, 40)
    elif duration <= 180:
        target = min(max_frames, 60)
    elif duration <= 600:
        target = min(max_frames, 80)
    else:
        target = max_frames
    fps = min(MAX_FPS, target / duration)
    return fps, min(max_frames, max(1, int(round(fps * duration))))


def extract_frames(video: str, out_dir: Path, duration: float, max_frames: int, resolution: int = 640) -> list[dict]:
    frames_dir = out_dir / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    for old in frames_dir.glob("frame_*.jpg"):
        old.unlink()
    fps, target = auto_fps(duration, max_frames)
    run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", video,
        "-vf", f"fps={fps},scale={resolution}:-2", "-frames:v", str(target), "-q:v", "4",
        str(frames_dir / "frame_%04d.jpg"),
    ])
    out = []
    for i, p in enumerate(sorted(frames_dir.glob("frame_*.jpg"))):
        out.append({"index": i, "timestamp_seconds": round(i / fps if fps else 0, 2), "path": str(p)})
    return out


def palette(video: str, out_dir: Path, warnings: list[str]) -> dict:
    pal = out_dir / "palette.png"
    res = run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", video,
        "-vf", "fps=1/3,scale=320:-1,palettegen=max_colors=12", str(pal),
    ])
    if res.returncode != 0 or not pal.exists():
        warnings.append("palette generation failed")
        return {}
    colors = []
    try:
        from PIL import Image  # type: ignore
        img = Image.open(pal).convert("RGB")
        seen = []
        for c in img.getdata():
            if c not in seen:
                seen.append(c)
        colors = ["#%02X%02X%02X" % c for c in seen[:12]]
    except Exception:  # noqa: BLE001
        warnings.append("Pillow not installed; palette hex not extracted (palette.png still written).")
    return {"file": str(pal), "colors": colors}


def transcript(video: str, warnings: list[str], language: str = "en") -> dict:
    try:
        import whisperx  # type: ignore
    except Exception as e:  # noqa: BLE001
        warnings.append(f"whisperx unavailable ({e}); transcript skipped.")
        return {}
    try:
        model = whisperx.load_model("small", "cpu", compute_type="int8", language=language)
        audio = whisperx.load_audio(video)
        result = model.transcribe(audio, language=language)
        am, meta = whisperx.load_align_model(language_code=language, device="cpu")
        aligned = whisperx.align(result["segments"], am, meta, audio, "cpu", return_char_alignments=False)
        words = [
            {"word": w.get("word", "").strip(), "start": w.get("start"), "end": w.get("end")}
            for seg in aligned.get("segments", []) for w in seg.get("words", [])
            if w.get("start") is not None
        ]
        text = " ".join(s.get("text", "").strip() for s in aligned.get("segments", []))
        return {"language": language, "text": text.strip(), "words": words}
    except Exception as e:  # noqa: BLE001
        warnings.append(f"transcription failed: {e}")
        return {}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("source")
    ap.add_argument("--out", required=True)
    ap.add_argument("--max-frames", type=int, default=60)
    ap.add_argument("--no-whisper", action="store_true")
    ap.add_argument("--language", default="en")
    args = ap.parse_args()

    if shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None:
        print(json.dumps({"ok": False, "error": "ffmpeg/ffprobe not found on PATH"}))
        sys.exit(2)

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    warnings: list[str] = []

    video = ingest(args.source, out_dir, warnings)
    if not video:
        print(json.dumps({"ok": False, "error": "could not obtain video", "warnings": warnings}))
        sys.exit(2)

    meta = ffprobe_meta(video)
    shots = detect_shots(video, warnings)
    frames = extract_frames(video, out_dir, meta.get("duration_seconds", 0), args.max_frames)
    pal = palette(video, out_dir, warnings)
    tx = {} if args.no_whisper else transcript(video, warnings, args.language)

    dur = meta.get("duration_seconds", 0) or 0
    shot_durs = [s["duration"] for s in shots] if shots else []
    pacing = {
        "shot_count": len(shots),
        "avg_shot_seconds": round(sum(shot_durs) / len(shot_durs), 2) if shot_durs else None,
        "cuts_per_minute": round(len(shots) / (dur / 60), 2) if dur and shots else None,
    }

    profile = {
        "ok": True,
        "source": args.source,
        "is_url": is_url(args.source),
        "meta": meta,
        "pacing": pacing,
        "shots": shots,
        "palette": pal,
        "transcript": tx,
        "frames": frames,
        "inspiration_notes": [
            "Use pacing.avg_shot_seconds and cuts_per_minute to match energy, not footage.",
            "Use palette.colors as a reference only — final styling must use the client brand system.",
            "Read the listed frames to summarize structure, hook, on-screen text cadence, and motion style.",
        ],
        "warnings": warnings,
    }
    (out_dir / "style_profile.json").write_text(json.dumps(profile, indent=2), encoding="utf-8")
    print(json.dumps(profile))


if __name__ == "__main__":
    main()

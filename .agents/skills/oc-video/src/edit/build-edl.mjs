// Transcript-driven Edit Decision List (EDL) engine for wm-video `edit` mode.
//
// Given a word-level transcript of a source video, decide which segments to
// KEEP: drop long silences and filler words, pad cuts so speech isn't clipped,
// and merge near-adjacent keeps. Deterministic and pure (no fs/ffmpeg) so it is
// unit-testable. The resulting EDL is reviewed by a human before rendering.

export const DEFAULT_FILLERS = [
  "um", "uh", "erm", "uhh", "umm", "hmm", "mmm", "eh",
  "like", "basically", "literally", "actually", "sorta", "kinda",
];

function norm(w) {
  return String(w || "").toLowerCase().replace(/[^a-z']/g, "");
}
function round2(n) { return Number(Number(n).toFixed(2)); }

export function buildEdl(transcript, opts = {}) {
  const minSilence = opts.min_silence_seconds ?? 0.6;
  const pad = opts.pad_seconds ?? 0.08;
  const mergeGap = opts.merge_gap_seconds ?? 0.12;
  const removeFillers = opts.remove_fillers !== false;
  const removeSilence = opts.remove_silence !== false;
  const fillers = new Set((opts.fillers ?? DEFAULT_FILLERS).map(norm));

  const words = (transcript.words || [])
    .filter((w) => Number.isFinite(Number(w.start)) && Number.isFinite(Number(w.end)))
    .map((w) => ({ start: Number(w.start), end: Number(w.end), word: w.word }))
    .sort((a, b) => a.start - b.start);

  const duration = Number(
    transcript.duration ?? (words.length ? words[words.length - 1].end : 0),
  ) || 0;

  if (words.length === 0) {
    return {
      keep_segments: duration ? [{ start: 0, end: round2(duration) }] : [],
      removed: { silences: [], fillers: [] },
      stats: { original_duration: round2(duration), edited_duration: round2(duration), removed_seconds: 0, filler_count: 0, silence_count: 0, segment_count: duration ? 1 : 0 },
      options: { min_silence_seconds: minSilence, pad_seconds: pad, remove_fillers: removeFillers, remove_silence: removeSilence },
    };
  }

  // 1. Drop filler words.
  const kept = [];
  const removedFillers = [];
  for (const w of words) {
    if (removeFillers && fillers.has(norm(w.word))) { removedFillers.push({ start: round2(w.start), end: round2(w.end), word: w.word }); continue; }
    kept.push(w);
  }

  // 2. Split into runs on silence gaps longer than the threshold.
  const runs = [];
  const removedSilences = [];
  let cur = null;
  for (const w of kept) {
    if (!cur) { cur = { start: w.start, end: w.end }; continue; }
    const gap = w.start - cur.end;
    if (removeSilence && gap > minSilence) {
      removedSilences.push({ start: round2(cur.end), end: round2(w.start), duration: round2(gap) });
      runs.push(cur);
      cur = { start: w.start, end: w.end };
    } else {
      cur.end = w.end;
    }
  }
  if (cur) runs.push(cur);

  // 3. Pad, clamp to [0,duration], and merge near-adjacent keeps.
  const padded = runs.map((s) => ({
    start: Math.max(0, s.start - pad),
    end: Math.min(duration || s.end + pad, s.end + pad),
  }));
  const merged = [];
  for (const s of padded) {
    const last = merged[merged.length - 1];
    if (last && s.start - last.end <= mergeGap) last.end = Math.max(last.end, s.end);
    else merged.push({ ...s });
  }
  const keep = merged.map((s) => ({ start: round2(s.start), end: round2(s.end) }));
  const editedDur = keep.reduce((a, s) => a + (s.end - s.start), 0);

  return {
    keep_segments: keep,
    removed: { silences: removedSilences, fillers: removedFillers },
    stats: {
      original_duration: round2(duration),
      edited_duration: round2(editedDur),
      removed_seconds: round2(duration - editedDur),
      filler_count: removedFillers.length,
      silence_count: removedSilences.length,
      segment_count: keep.length,
    },
    options: { min_silence_seconds: minSilence, pad_seconds: pad, merge_gap_seconds: mergeGap, remove_fillers: removeFillers, remove_silence: removeSilence },
  };
}

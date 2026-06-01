// Voice-first timing engine for wm-video.
//
// Turns word-level narration alignment (e.g. from WhisperX) into reconciled
// scene durations and per-scene caption / focus / motion / beat timelines that
// are LOCKED to the words actually spoken — instead of dividing scene time
// evenly. This is the core of the "congruency" upgrade: visuals land on the
// narration, not on arbitrary intervals.
//
// Pure module: no fs, no network. Deterministic. Unit-testable with a synthetic
// alignment, which is why it carries no I/O.

// ---- text normalization ----------------------------------------------------

export function normalizeWord(w) {
  return String(w == null ? "" : w)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")   // strip diacritics
    .replace(/[^a-z0-9]+/g, "");        // keep alphanumerics only
}

export function tokenizeText(text) {
  return String(text || "")
    .split(/\s+/)
    .map((raw) => ({ raw, norm: normalizeWord(raw) }))
    .filter((t) => t.norm.length > 0);
}

// Locate a phrase (sequence of normalized tokens) inside a scene's token list,
// starting at or after `fromIndex`. Returns {start,end} token indices or null.
function findPhraseTokenRange(sceneTokens, phraseNorms, fromIndex = 0) {
  if (phraseNorms.length === 0) return null;
  for (let i = fromIndex; i <= sceneTokens.length - phraseNorms.length; i++) {
    let ok = true;
    for (let j = 0; j < phraseNorms.length; j++) {
      if (sceneTokens[i + j].norm !== phraseNorms[j]) { ok = false; break; }
    }
    if (ok) return { start: i, end: i + phraseNorms.length - 1 };
  }
  return null;
}

// ---- expected-token stream --------------------------------------------------

// Build the full expected token stream across scenes, tagging each token with
// its scene index and (when it falls inside an on-screen point phrase) the
// point index. The narration is the source of truth for word order.
export function buildExpectedTokens(scenes) {
  const expected = [];
  scenes.forEach((scene, sceneIndex) => {
    const narration = scene.narration || scene.copy?.subhead || scene.title || "";
    const sceneTokens = tokenizeText(narration);

    // Map each on-screen point to a token range within the narration (best effort).
    const points = scene.points || scene.copy?.points || scene.visual_focus || [];
    const pointRanges = [];
    let cursor = 0;
    points.forEach((point, pointIndex) => {
      const phraseNorms = tokenizeText(point).map((t) => t.norm);
      const range = findPhraseTokenRange(sceneTokens, phraseNorms, cursor);
      if (range) {
        pointRanges.push({ pointIndex, ...range });
        cursor = range.end + 1;
      } else {
        pointRanges.push({ pointIndex, start: null, end: null });
      }
    });

    sceneTokens.forEach((tok, tokenIndex) => {
      const owningPoint = pointRanges.find(
        (r) => r.start != null && tokenIndex >= r.start && tokenIndex <= r.end,
      );
      expected.push({
        norm: tok.norm,
        raw: tok.raw,
        sceneIndex,
        pointIndex: owningPoint ? owningPoint.pointIndex : null,
      });
    });

    // A scene with no narration still needs to exist in the stream so timing
    // can fall back to proportional distribution.
    if (sceneTokens.length === 0) {
      expected.push({ norm: "", raw: "", sceneIndex, pointIndex: null, empty: true });
    }
  });
  return expected;
}

// ---- alignment matcher ------------------------------------------------------

// Walk aligned words against the expected token stream in order. Tolerant of
// small ASR mismatches: if a word doesn't match the current expected token, we
// look a few tokens ahead; failing that we still advance both so drift can't
// stall the whole stream. Returns expected[] with {start,end} stamped on
// matched tokens.
export function alignTokens(expected, alignedWords, opts = {}) {
  const lookahead = opts.lookahead ?? 4;
  const stamped = expected.map((t) => ({ ...t, start: null, end: null }));
  let ei = 0;
  for (const aw of alignedWords) {
    const an = normalizeWord(aw.word ?? aw.text ?? "");
    if (!an) continue;
    let matchIndex = -1;
    for (let k = 0; k < lookahead && ei + k < stamped.length; k++) {
      if (stamped[ei + k].empty) continue;
      if (stamped[ei + k].norm === an) { matchIndex = ei + k; break; }
    }
    if (matchIndex === -1) {
      // No nearby match — attribute the time to the current token to preserve
      // monotonic coverage, but don't advance past it.
      matchIndex = Math.min(ei, stamped.length - 1);
    }
    const tok = stamped[matchIndex];
    if (tok) {
      const s = Number(aw.start);
      const e = Number(aw.end ?? aw.start);
      if (Number.isFinite(s)) tok.start = tok.start == null ? s : Math.min(tok.start, s);
      if (Number.isFinite(e)) tok.end = tok.end == null ? e : Math.max(tok.end, e);
      ei = matchIndex + 1;
    }
    if (ei >= stamped.length) break;
  }
  return stamped;
}

// ---- timing derivation ------------------------------------------------------

function round2(n) { return Number(Number(n).toFixed(2)); }

// Compute aligned [start,end] for a contiguous group of stamped tokens.
function spanOf(tokens) {
  const starts = tokens.filter((t) => t.start != null).map((t) => t.start);
  const ends = tokens.filter((t) => t.end != null).map((t) => t.end);
  if (starts.length === 0 || ends.length === 0) return null;
  return { start: Math.min(...starts), end: Math.max(...ends) };
}

// Main entry. plan = { scenes:[{scene_id, narration, points|copy.points}] },
// alignment = { words:[{word,start,end}] }. Returns reconciled per-scene timing.
export function deriveTiming(plan, alignment, opts = {}) {
  const leadIn = opts.lead_in_seconds ?? 0.0;
  const scenePad = opts.scene_pad_seconds ?? 0.25;     // breathing room after last word
  const minScene = opts.min_scene_seconds ?? 1.5;
  const easing = opts.easing ?? "cubic-bezier(0.22, 1, 0.36, 1)";
  const stagger = opts.stagger_seconds ?? 0.15;

  const scenes = plan.scenes || [];
  const expected = buildExpectedTokens(scenes);
  const words = (alignment && alignment.words) || [];
  const haveAlignment = words.length > 0;
  const stamped = haveAlignment ? alignTokens(expected, words, opts) : expected.map((t) => ({ ...t, start: null, end: null }));

  // Total narration duration (for proportional fallback when alignment missing).
  const alignedEnd = haveAlignment
    ? Math.max(0, ...words.map((w) => Number(w.end ?? w.start) || 0))
    : 0;

  let prevEnd = leadIn;
  const result = scenes.map((scene, sceneIndex) => {
    const sceneTokens = stamped.filter((t) => t.sceneIndex === sceneIndex && !t.empty);
    const points = scene.points || scene.copy?.points || scene.visual_focus || [];

    const sceneSpan = spanOf(sceneTokens);
    let sceneStart, sceneEnd, source;
    if (sceneSpan) {
      sceneStart = sceneSpan.start;
      sceneEnd = sceneSpan.end + scenePad;
      source = "aligned";
    } else {
      // Fallback: proportional to word share, or the plan's authored duration.
      const wordShare = sceneTokens.length || (scene.points || []).length || 1;
      const totalWords = stamped.filter((t) => !t.empty).length || 1;
      const guess = haveAlignment ? (alignedEnd * wordShare) / totalWords : (scene.duration_seconds || 5);
      sceneStart = prevEnd;
      sceneEnd = prevEnd + Math.max(minScene, guess);
      source = haveAlignment ? "proportional_fallback" : "authored_fallback";
    }
    // Keep scenes contiguous and monotonic.
    if (sceneStart < prevEnd) sceneStart = prevEnd;
    if (sceneEnd - sceneStart < minScene) sceneEnd = sceneStart + minScene;
    const duration = round2(sceneEnd - sceneStart);

    // Per-point timing, relative to scene start.
    const pointEvents = points.map((point, pointIndex) => {
      const pointTokens = sceneTokens.filter((t) => t.pointIndex === pointIndex);
      const span = spanOf(pointTokens);
      if (span) {
        return {
          point,
          start: round2(Math.max(0, span.start - sceneStart)),
          end: round2(Math.max(0, span.end - sceneStart)),
          source: "aligned",
        };
      }
      // Even fallback within the scene if this phrase wasn't found in audio.
      const seg = duration / Math.max(points.length, 1);
      return {
        point,
        start: round2(pointIndex * seg),
        end: round2((pointIndex + 1) * seg),
        source: "even_fallback",
      };
    });

    prevEnd = sceneEnd;
    return {
      scene_id: scene.scene_id,
      start: round2(sceneStart),
      end: round2(sceneEnd),
      duration_seconds: duration,
      timing_source: source,
      points: pointEvents,
      timelines: buildTimelines(scene, pointEvents, { easing, stagger }),
    };
  });

  const totalDuration = result.length ? result[result.length - 1].end : 0;
  return {
    task_id: plan.task_id,
    have_alignment: haveAlignment,
    lead_in_seconds: leadIn,
    total_duration_seconds: round2(totalDuration),
    narration_duration_seconds: round2(alignedEnd),
    scenes: result,
  };
}

// Build the four synced timelines for a scene from point events.
function buildTimelines(scene, pointEvents, { easing, stagger }) {
  const caption_timeline = {
    scene_id: scene.scene_id,
    caption_style: "kinetic_phrase_tokens_high_contrast",
    phrase_events: pointEvents.map((p) => ({
      start: p.start, end: p.end, phrase: p.point, emphasis: "scale_pop", source: p.source,
    })),
  };
  const focus_timeline = {
    scene_id: scene.scene_id,
    focus_events: pointEvents.map((p, i) => ({
      start: p.start, end: p.end, active_point: p.point,
      inactive_behavior: "dim_recede", pointer: "move_click_tooltip", index: i,
    })),
  };
  const motion_timeline = {
    scene_id: scene.scene_id,
    director: "wm_academy_visual_focus_director",
    motion_architecture: { easing, stagger_seconds: stagger, restraint: "element-level motion only" },
    events: pointEvents.map((p, i) => ({
      time: p.start, type: "card_focus", target: `card_${i + 1}`, label: p.point,
      animation: "ease_out_focus_scale_line_draw_caption_emphasis",
    })),
  };
  const beat_timeline = {
    scene_id: scene.scene_id,
    easing, stagger_seconds: stagger,
    beats: pointEvents.flatMap((p, i) => [
      { time: p.start, type: "focus_enter", target: `point_${i + 1}`, label: p.point },
      { time: round2(p.start + 0.35), type: "caption_emphasis", target: "kinetic_caption", label: p.point },
    ]),
  };
  return { caption_timeline, focus_timeline, motion_timeline, beat_timeline };
}

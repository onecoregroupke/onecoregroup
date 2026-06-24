import test from "node:test";
import assert from "node:assert/strict";
import { deriveTiming, buildExpectedTokens, alignTokens } from "../src/align/derive-timing.mjs";

const plan = {
  task_id: "TASK-TEST",
  scenes: [
    { scene_id: "scene_001", narration: "Welcome to the operating system for MuzikiEd", points: ["operating system"] },
    { scene_id: "scene_002", narration: "Track schools and track tutors clearly", points: ["Track schools", "track tutors"] },
  ],
};

// Word-level alignment as WhisperX would return it.
const alignment = {
  words: [
    { word: "Welcome", start: 0.0, end: 0.4 },
    { word: "to", start: 0.4, end: 0.6 },
    { word: "the", start: 0.6, end: 0.7 },
    { word: "operating", start: 0.7, end: 1.2 },
    { word: "system", start: 1.2, end: 1.8 },
    { word: "for", start: 1.8, end: 2.0 },
    { word: "MuzikiEd", start: 2.0, end: 2.6 },
    { word: "Track", start: 3.0, end: 3.3 },
    { word: "schools", start: 3.3, end: 3.9 },
    { word: "and", start: 3.9, end: 4.0 },
    { word: "track", start: 4.0, end: 4.3 },
    { word: "tutors", start: 4.3, end: 4.9 },
    { word: "clearly", start: 4.9, end: 5.4 },
  ],
};

test("point phrases are tagged to the right scene/point", () => {
  const exp = buildExpectedTokens(plan.scenes);
  const opTokens = exp.filter((t) => t.sceneIndex === 0 && t.pointIndex === 0).map((t) => t.norm);
  assert.deepEqual(opTokens, ["operating", "system"]);
  // "track tutors" must map to the SECOND occurrence of "track", not the first.
  const s2p1 = exp.filter((t) => t.sceneIndex === 1 && t.pointIndex === 1).map((t) => t.norm);
  assert.deepEqual(s2p1, ["track", "tutors"]);
});

test("scene durations are derived from spoken words, not even division", () => {
  const out = deriveTiming(plan, alignment, { scene_pad_seconds: 0.25 });
  assert.equal(out.have_alignment, true);

  const s1 = out.scenes[0];
  assert.equal(s1.start, 0.0);
  assert.equal(s1.end, 2.85);            // last word 2.6 + 0.25 pad
  assert.equal(s1.duration_seconds, 2.85);
  assert.equal(s1.timing_source, "aligned");
  // caption for "operating system" lands exactly where it's spoken
  assert.equal(s1.points[0].start, 0.7);
  assert.equal(s1.points[0].end, 1.8);

  const s2 = out.scenes[1];
  assert.equal(s2.start, 3.0);
  assert.equal(s2.end, 5.65);
  assert.equal(s2.points[0].start, 0.0);  // "Track schools" at scene-relative 0
  assert.equal(s2.points[0].end, 0.9);
  assert.equal(s2.points[1].start, 1.0);  // "track tutors" at scene-relative 1.0
  assert.equal(s2.points[1].end, 1.9);
});

test("timelines are emitted and synced to the point events", () => {
  const out = deriveTiming(plan, alignment);
  const s1 = out.scenes[0];
  assert.equal(s1.timelines.caption_timeline.phrase_events[0].start, 0.7);
  assert.equal(s1.timelines.motion_timeline.events[0].time, 0.7);
  assert.equal(s1.timelines.focus_timeline.focus_events[0].start, 0.7);
});

test("graceful fallback when no alignment is available", () => {
  const out = deriveTiming(plan, { words: [] });
  assert.equal(out.have_alignment, false);
  // still produces contiguous, monotonic scenes with non-zero durations
  assert.ok(out.scenes[0].duration_seconds >= 1.5);
  assert.ok(out.scenes[1].start >= out.scenes[0].end);
});

import test from "node:test";
import assert from "node:assert/strict";
import { buildEdl } from "../src/edit/build-edl.mjs";

const transcript = {
  duration: 4.5,
  words: [
    { word: "Hello", start: 0.0, end: 0.4 },
    { word: "um", start: 0.5, end: 0.8 },     // filler -> dropped
    { word: "world", start: 0.9, end: 1.3 },
    // long silence 1.3 -> 3.0 (1.7s) -> cut
    { word: "this", start: 3.0, end: 3.3 },
    { word: "is", start: 3.3, end: 3.5 },
    { word: "great", start: 3.5, end: 4.0 },
  ],
  segments: [],
};

test("drops fillers and long silences, keeps speech with padding", () => {
  const edl = buildEdl(transcript);
  assert.equal(edl.keep_segments.length, 2);
  assert.deepEqual(edl.keep_segments[0], { start: 0, end: 1.38 });   // 0 .. world.end+pad
  assert.deepEqual(edl.keep_segments[1], { start: 2.92, end: 4.08 }); // this.start-pad .. great.end+pad
  assert.equal(edl.removed.fillers.length, 1);
  assert.equal(edl.removed.fillers[0].word, "um");
  assert.equal(edl.removed.silences.length, 1);
  assert.equal(edl.stats.segment_count, 2);
  assert.equal(edl.stats.original_duration, 4.5);
  assert.equal(edl.stats.edited_duration, 2.54);
  assert.equal(edl.stats.removed_seconds, 1.96);
});

test("keep-silence + keep-fillers retains everything as one run", () => {
  const edl = buildEdl(transcript, { remove_silence: false, remove_fillers: false });
  assert.equal(edl.keep_segments.length, 1);
  assert.equal(edl.removed.fillers.length, 0);
  assert.equal(edl.removed.silences.length, 0);
});

test("empty transcript falls back to full duration", () => {
  const edl = buildEdl({ duration: 10, words: [] });
  assert.deepEqual(edl.keep_segments, [{ start: 0, end: 10 }]);
});

import test from "node:test";
import assert from "node:assert/strict";
import { buildAss, secondsToAss } from "../src/edit/captions-ass.mjs";

test("secondsToAss formats H:MM:SS.cc", () => {
  assert.equal(secondsToAss(0), "0:00:00.00");
  assert.equal(secondsToAss(75.5), "0:01:15.50");
  assert.equal(secondsToAss(3661.25), "1:01:01.25");
});

test("buildAss emits a style + one Dialogue per segment", () => {
  const { ass, line_count } = buildAss({
    segments: [
      { start: 0, end: 2, text: "Hello world" },
      { start: 3, end: 4, text: "this is great" },
    ],
  }, { width: 1080, height: 1920 });
  assert.equal(line_count, 2);
  assert.match(ass, /\[V4\+ Styles\]/);
  assert.match(ass, /Style: WM,/);
  const dialogues = ass.split(/\r?\n/).filter((l) => l.startsWith("Dialogue:"));
  assert.equal(dialogues.length, 2);
  assert.match(dialogues[0], /^Dialogue: 0,0:00:00\.00,0:00:02\.00,WM,,0,0,0,,Hello world$/);
});

test("falls back to grouping words when no segments", () => {
  const words = "the quick brown fox jumps over the lazy dog again now".split(" ")
    .map((w, i) => ({ word: w, start: i * 0.4, end: i * 0.4 + 0.35 }));
  const { line_count } = buildAss({ words }, { max_line_chars: 20 });
  assert.ok(line_count >= 2);
});

// Real FFmpeg integration test for the `edit` render command builders.
// Generates a synthetic clip, then cuts two segments, concats, and does the
// final reframe (16:9 -> 9:16) + loudnorm pass — verifying the actual ffmpeg
// command shapes we ship. Skips cleanly if ffmpeg/ffprobe are unavailable.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ffmpegPath, ffprobePath, runOrDry } from "../src/ffmpeg/ffmpeg-utils.mjs";
import { extractSegmentArgs, concatArgs, finalPassArgs, reframeFilter, concatListText } from "../src/edit/render-edit.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = path.join(here, ".tmp-edit");

async function ffmpegAvailable() {
  try { await runOrDry([ffmpegPath(), "-version"]); return true; } catch { return false; }
}
async function ffprobeJson(file) {
  const { stdout } = await runOrDry([ffprobePath(), "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", file]);
  return JSON.parse(stdout);
}

test("reframeFilter shapes", () => {
  assert.match(reframeFilter(1080, 1920, "crop"), /force_original_aspect_ratio=increase,crop=1080:1920/);
  assert.match(reframeFilter(1080, 1920, "pad"), /force_original_aspect_ratio=decrease,pad=1080:1920/);
});

test("cut -> concat -> reframe + loudnorm produces a 9:16 clip", { timeout: 120000 }, async (t) => {
  if (!(await ffmpegAvailable())) { t.skip("ffmpeg not available"); return; }
  await fsp.mkdir(tmp, { recursive: true });
  const src = path.join(tmp, "src.mp4");

  // 6s 640x360 test video with a 440Hz tone.
  await runOrDry([ffmpegPath(), "-y",
    "-f", "lavfi", "-i", "testsrc=duration=6:size=640x360:rate=30",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=6",
    "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", src]);
  assert.ok(fs.existsSync(src));

  // Keep [0.5,2.0] and [3.0,4.5] -> ~3s total.
  const segs = [{ start: 0.5, end: 2.0 }, { start: 3.0, end: 4.5 }];
  const segFiles = [];
  for (let i = 0; i < segs.length; i++) {
    const out = path.join(tmp, `seg_${i + 1}.mp4`);
    await runOrDry(extractSegmentArgs({ src, start: segs[i].start, end: segs[i].end, out }));
    segFiles.push(out);
  }
  const listFile = path.join(tmp, "concat.txt");
  await fsp.writeFile(listFile, concatListText(segFiles));
  const joined = path.join(tmp, "joined.mp4");
  await runOrDry(concatArgs({ listFile, out: joined }));

  const draft = path.join(tmp, "draft.mp4");
  await runOrDry(finalPassArgs({ input: joined, out: draft, reframe: reframeFilter(1080, 1920, "crop") }), { cwd: tmp });

  const meta = await ffprobeJson(draft);
  const v = meta.streams.find((s) => s.codec_type === "video");
  assert.equal(v.width, 1080);
  assert.equal(v.height, 1920);
  const dur = Number(meta.format.duration);
  assert.ok(dur > 2.5 && dur < 3.8, `expected ~3s, got ${dur}`);

  await fsp.rm(tmp, { recursive: true, force: true });
});

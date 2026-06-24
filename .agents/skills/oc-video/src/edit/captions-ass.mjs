// Build a burn-ready .ass subtitle file from a transcript. Pure string builder
// (testable). Prefers segment lines; falls back to grouping words into lines.

export function secondsToAss(t) {
  const x = Math.max(0, Number(t) || 0);
  const h = Math.floor(x / 3600);
  const m = Math.floor((x % 3600) / 60);
  const s = Math.floor(x % 60);
  const cs = Math.round((x - Math.floor(x)) * 100);
  const cc = cs === 100 ? 99 : cs; // guard rounding to 100
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cc).padStart(2, "0")}`;
}

function escapeAss(text) {
  return String(text || "").replace(/\r?\n/g, " ").replace(/\{/g, "(").replace(/\}/g, ")").trim();
}

// Group words into caption lines of <= maxChars, breaking on the longest gap.
function linesFromWords(words, maxChars) {
  const lines = [];
  let cur = null;
  for (const w of words) {
    const word = String(w.word || "").trim();
    if (!word) continue;
    if (!cur) { cur = { start: w.start, end: w.end, text: word }; continue; }
    const next = `${cur.text} ${word}`;
    if (next.length > maxChars) { lines.push(cur); cur = { start: w.start, end: w.end, text: word }; }
    else { cur.text = next; cur.end = w.end; }
  }
  if (cur) lines.push(cur);
  return lines;
}

export function buildAss(transcript, opts = {}) {
  const playResX = opts.width || 1080;
  const playResY = opts.height || 1920;
  const font = opts.font || "Arial";
  const fontSize = opts.font_size || Math.round(playResY * 0.045);
  const maxChars = opts.max_line_chars || 38;
  // WM brand: white fill, near-black outline, slight shadow, bottom-centered.
  const primary = opts.primary || "&H00FFFFFF";
  const outline = opts.outline || "&H00141414";

  const segs = (transcript.segments || []).filter((s) => Number.isFinite(Number(s.start)) && Number.isFinite(Number(s.end)) && String(s.text || "").trim());
  const lines = segs.length
    ? segs.map((s) => ({ start: Number(s.start), end: Number(s.end), text: s.text }))
    : linesFromWords(transcript.words || [], maxChars);

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${playResX}`,
    `PlayResY: ${playResY}`,
    "WrapStyle: 2",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: WM,${font},${fontSize},${primary},&H000000FF,${outline},&H64000000,-1,0,0,0,100,100,0,0,1,4,2,2,80,80,${Math.round(playResY * 0.08)},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const events = lines.map((l) => `Dialogue: 0,${secondsToAss(l.start)},${secondsToAss(l.end)},WM,,0,0,0,,${escapeAss(l.text)}`);
  return { ass: [...header, ...events].join("\n") + "\n", line_count: lines.length };
}

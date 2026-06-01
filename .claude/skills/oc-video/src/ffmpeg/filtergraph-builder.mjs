export function stillImageVideoArgs({ image, duration, out, width = 1920, height = 1080 }) {
  return [
    "-loop", "1",
    "-i", image,
    "-t", String(duration),
    "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,
    "-c:v", "libx264",
    "-r", "30",
    "-pix_fmt", "yuv420p",
    out
  ];
}

export function concatFileText(files) {
  return files.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n") + "\n";
}

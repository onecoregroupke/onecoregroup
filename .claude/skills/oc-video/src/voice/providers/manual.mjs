import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { ffmpegPath, runOrDry } from "../../ffmpeg/ffmpeg-utils.mjs";

export const manualProvider = {
  async status() {
    return { ok: true, provider: "manual", message: "Use --file path/to/voice.wav or place voice/manual.wav in the task folder." };
  },
  async synthesize({ sourceFile, outputFile }) {
    if (!sourceFile || !fs.existsSync(sourceFile)) {
      throw new Error("Manual voice provider requires --file pointing to an existing WAV/MP3 file.");
    }
    if (/\.wav$/i.test(sourceFile)) {
      await fsp.copyFile(sourceFile, outputFile);
    } else {
      await runOrDry([ffmpegPath(), "-y", "-i", sourceFile, "-ar", "48000", "-ac", "2", outputFile]);
    }
    return { output_file: outputFile, provider: "manual", source_file: path.resolve(sourceFile) };
  },
};

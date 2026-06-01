import { spawn } from "node:child_process";
import { readEnv } from "../project-fs.mjs";
import { chromePath } from "../render/chrome-renderer.mjs";
import { venvPython, pyModuleOk } from "../align/py-env.mjs";

export function ffmpegPath() {
  return readEnv().FFMPEG_PATH || "ffmpeg";
}

export function ffprobePath() {
  return readEnv().FFPROBE_PATH || "ffprobe";
}

export function runOrDry(cmd, { dryRun = false, cwd } = {}) {
  if (dryRun) return { dry_run: true, command: cmd };
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd[0], cmd.slice(1), { stdio: ["ignore", "pipe", "pipe"], cwd });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => stdout += d);
    proc.stderr.on("data", (d) => stderr += d);
    proc.on("error", (err) => reject(new Error(`${cmd[0]} not runnable: ${err.message}`)));
    proc.on("close", (code) => code === 0 ? resolve({ command: cmd, stdout, stderr }) : reject(new Error(`${cmd[0]} exited ${code}\n${stderr}`)));
  });
}

async function version(command) {
  try {
    const result = await runOrDry([command, "-version"]);
    return { ok: true, first_line: (result.stdout || result.stderr).split(/\r?\n/)[0] };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function commandOk(cmd, arg = "--version") {
  try {
    const r = await runOrDry([cmd, arg]);
    return { ok: true, first_line: (r.stdout || r.stderr).split(/\r?\n/)[0] };
  } catch (e) {
    return { ok: false, error: e.message.split(/\r?\n/)[0] };
  }
}

export async function doctor() {
  const py = venvPython();
  const pyEnv = py
    ? {
        ok: true,
        python: py,
        whisperx: await pyModuleOk("whisperx"),
        scenedetect: await pyModuleOk("scenedetect"),
      }
    : { ok: false, note: "No .venv. Run scripts/setup-video-env.ps1 (Python 3.11/3.12) for align-voice + reference." };
  return {
    chrome: { ok: !!chromePath(), path: chromePath() },
    ffmpeg: await version(ffmpegPath()),
    ffprobe: await version(ffprobePath()),
    node: process.version,
    python_toolchain: pyEnv,
    yt_dlp: await commandOk("yt-dlp"),
    // 'piper' is optional; only needed for generated narration.
    piper: await commandOk(readEnv().PIPER_BIN || "piper", "--help"),
    readiness: {
      motion_render: !!chromePath(),
      voice_alignment: !!py,
      reference_analysis: !!py,
    },
  };
}

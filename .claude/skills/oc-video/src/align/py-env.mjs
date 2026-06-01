// Resolve the pinned Python toolchain (.venv) used by the faster-whisper alignment
// and reference-analysis steps. System Python is intentionally NOT used as a
// fallback for ML work — it is often too new for the PyTorch/faster-whisper stack.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { SKILL_ROOT, readEnv } from "../project-fs.mjs";

export function venvPython() {
  const env = readEnv();
  const candidates = [
    env.WM_VIDEO_PYTHON,                                  // explicit override
    path.join(SKILL_ROOT, ".venv", "Scripts", "python.exe"), // Windows venv
    path.join(SKILL_ROOT, ".venv", "bin", "python"),         // POSIX venv
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

// Run a python module/script in the venv and capture stdout. Rejects with a
// clear, actionable error when the venv or a package is missing — never fakes.
export function runPython(args, { cwd = SKILL_ROOT, timeoutMs = 0 } = {}) {
  const py = venvPython();
  if (!py) {
    return Promise.reject(new Error(
      "wm-video Python toolchain not found. Run scripts/setup-video-env.ps1 to create the .venv (Python 3.11/3.12) with faster-whisper + scenedetect + yt-dlp, or set WM_VIDEO_PYTHON.",
    ));
  }
  // Keep the Whisper/HF model cache off the (small) skill drive.
  const env = { ...process.env };
  const hf = process.env.WM_VIDEO_HF_HOME || readEnv().WM_VIDEO_HF_HOME
    || (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "wm-video-models") : null);
  if (hf) { env.HF_HOME = env.HF_HOME || hf; env.HUGGINGFACE_HUB_CACHE = env.HUGGINGFACE_HUB_CACHE || hf; }
  // Expose the venv's Scripts/bin dir so console tools installed in the venv
  // (e.g. yt-dlp) resolve for subprocesses the python launches.
  const scriptsDir = path.dirname(py);
  env.PATH = scriptsDir + path.delimiter + (env.PATH || env.Path || "");
  return new Promise((resolve, reject) => {
    const proc = spawn(py, args, { cwd, stdio: ["ignore", "pipe", "pipe"], env });
    let out = "", err = "";
    proc.stdout.on("data", (d) => (out += d));
    proc.stderr.on("data", (d) => (err += d));
    if (timeoutMs) setTimeout(() => proc.kill(), timeoutMs);
    proc.on("close", (code) => code === 0
      ? resolve({ stdout: out, stderr: err })
      : reject(new Error(`python exited ${code}\n${err.trim() || out.trim()}`)));
  });
}

// Probe whether a python module imports cleanly in the venv (for doctor).
export async function pyModuleOk(moduleName) {
  const py = venvPython();
  if (!py) return { ok: false, error: "no .venv" };
  try {
    const { stdout } = await runPython(["-c", `import ${moduleName} as m; print(getattr(m,'__version__','ok'))`]);
    return { ok: true, version: stdout.trim() };
  } catch (e) {
    return { ok: false, error: String(e.message || e).split("\n").pop() };
  }
}

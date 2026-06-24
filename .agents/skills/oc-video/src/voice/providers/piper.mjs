import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { readEnv, SKILL_ROOT } from "../../project-fs.mjs";

function piperExe() {
  const env = readEnv();
  if (env.PIPER_EXECUTABLE_PATH) return env.PIPER_EXECUTABLE_PATH;
  if (env.PIPER_EXE) return env.PIPER_EXE;
  for (const candidate of [
    path.join(SKILL_ROOT, "tools", "piper", "piper.exe"),
    path.join(SKILL_ROOT, "tools", "piper", "piper", "piper.exe"),
  ]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(SKILL_ROOT, "tools", "piper", "piper.exe");
}

function modelPath(profile) {
  const configured = readEnv().PIPER_VOICE_MODEL || profile?.voice_model || profile?.voice_model_path || "";
  const resolved = path.resolve(SKILL_ROOT, configured);
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    const model = fs.readdirSync(resolved).find((name) => name.endsWith(".onnx"));
    if (model) return path.join(resolved, model);
  }
  return configured && path.isAbsolute(configured) ? configured : resolved;
}

function runPiper(args, input) {
  return new Promise((resolve, reject) => {
    const proc = spawn(piperExe(), args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => stdout += d);
    proc.stderr.on("data", (d) => stderr += d);
    proc.on("error", (error) => reject(error));
    proc.on("close", (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`piper exited ${code}\n${stderr}`)));
    proc.stdin.end(input);
  });
}

export const piperProvider = {
  async status(profile) {
    const model = modelPath(profile);
    const config = profile?.voice_config ? path.resolve(SKILL_ROOT, profile.voice_config) : `${model}.json`;
    const exe = piperExe();
    if (!fs.existsSync(exe) && !/^(piper|piper\.exe)$/i.test(exe)) {
      return {
        ok: false,
        provider: "piper",
        executable: exe,
        model,
        config,
        error: "Piper executable not found. Install Piper under tools/piper or set PIPER_EXECUTABLE_PATH.",
      };
    }
    if (!fs.existsSync(model)) {
      return {
        ok: false,
        provider: "piper",
        executable: exe,
        model,
        config,
        error: "Piper voice model not found. Add voice.onnx under the selected reference/voice/piper/voices profile folder.",
      };
    }
    if (!fs.existsSync(config)) {
      return {
        ok: false,
        provider: "piper",
        executable: exe,
        model,
        config,
        error: "Piper voice config not found. Add voice.onnx.json beside the selected voice.onnx file.",
      };
    }
    try {
      await runPiper(["--help"], "");
      return { ok: true, provider: "piper", executable: exe, model, config };
    } catch (error) {
      return {
        ok: false,
        provider: "piper",
        executable: exe,
        model,
        config,
        error: "Piper executable unavailable. Install Piper or set PIPER_EXECUTABLE_PATH.",
        detail: error.message,
      };
    }
  },
  async synthesize({ profile, text, outputFile }) {
    const model = modelPath(profile);
    await runPiper(["--model", model, "--output_file", outputFile], text);
    return { output_file: outputFile, provider: "piper", model };
  },
};

import fs from "node:fs";
import path from "node:path";
import { SKILL_ROOT, readJson } from "../project-fs.mjs";

export function audioRegistry() {
  const registry = readJson(path.join(SKILL_ROOT, "registry", "audio.registry.json"), { assets: [] });
  return registry.assets || [];
}

export function resolveAudioAsset(assetId) {
  const asset = audioRegistry().find((item) => item.asset_id === assetId);
  if (!asset) return null;
  return { ...asset, absolute_path: path.resolve(SKILL_ROOT, asset.path) };
}

export function fileExists(asset) {
  return !!asset?.absolute_path && fs.existsSync(asset.absolute_path);
}

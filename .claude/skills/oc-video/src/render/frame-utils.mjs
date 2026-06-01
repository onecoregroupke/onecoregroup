import path from "node:path";
import { ensureDir } from "../project-fs.mjs";

export function framePattern(dir) {
  return path.join(dir, "frame-%06d.png");
}

export async function sceneFrameDir(base, sceneId) {
  const dir = path.join(base, sceneId);
  await ensureDir(dir);
  return dir;
}

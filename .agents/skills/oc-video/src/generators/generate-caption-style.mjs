import path from "node:path";
import { SKILL_ROOT } from "../project-fs.mjs";

export function captionStylePath(brand = "wmandco") {
  return path.join(SKILL_ROOT, "reference", "brands", brand, "caption_style.ass");
}

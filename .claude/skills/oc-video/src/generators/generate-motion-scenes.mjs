import path from "node:path";
import { readJson, taskPaths, writeJson, writeText } from "../project-fs.mjs";
import { animationJs, sceneCss, sceneHtml } from "./component-factory.mjs";

// Even-division fallback timelines (used when no voice-derived timing exists).
function evenTimelines(sceneId, points, duration) {
  const segment = duration / Math.max(points.length || 1, 1);
  const at = (i) => Number((i * segment).toFixed(2));
  const end = (i) => Number(((i + 1) * segment).toFixed(2));
  return {
    caption_timeline: {
      scene_id: sceneId, caption_style: "kinetic_phrase_tokens_high_contrast",
      phrase_events: points.map((p, i) => ({ start: at(i), end: end(i), phrase: p, emphasis: "scale_pop", source: "even_fallback" })),
    },
    focus_timeline: {
      scene_id: sceneId,
      focus_events: points.map((p, i) => ({ start: at(i), end: end(i), active_point: p, inactive_behavior: "dim_recede", pointer: "move_click_tooltip" })),
    },
    motion_timeline: {
      scene_id: sceneId, director: "wm_academy_visual_focus_director",
      motion_architecture: { easing: "cubic-bezier(0.22, 1, 0.36, 1)", stagger_seconds: 0.15, restraint: "element-level motion only" },
      events: points.map((p, i) => ({ time: at(i), type: "card_focus", target: `card_${i + 1}`, label: p, animation: "ease_out_focus_scale_line_draw_caption_emphasis" })),
    },
    beat_timeline: {
      scene_id: sceneId, easing: "cubic-bezier(0.22, 1, 0.36, 1)", stagger_seconds: 0.15,
      beats: points.flatMap((p, i) => [
        { time: at(i), type: "focus_enter", target: `point_${i + 1}`, label: p },
        { time: Number((at(i) + 0.35).toFixed(2)), type: "caption_emphasis", target: "kinetic_caption", label: p },
      ]),
    },
  };
}

export async function generateMotionScenes(taskId) {
  const paths = taskPaths(taskId);
  const plan = readJson(path.join(paths.planning, "motion_plan.json"));
  if (!plan) throw new Error("Missing planning/motion_plan.json. Run plan first.");

  // Voice-locked timing from align-voice, if available.
  const derived = readJson(path.join(paths.planning, "derived_timing.json"), null);
  const derivedByScene = derived ? Object.fromEntries((derived.scenes || []).map((s) => [s.scene_id, s])) : {};
  const timingSource = derived ? `voice_derived:${derived.alignment_source || "unknown"}` : "even_fallback";

  const generated = [];
  for (const scene of plan.scenes || []) {
    const dir = path.join(paths.scenes, scene.scene_id);
    const copy = scene.copy || {};
    const points = copy.points || scene.points || scene.visual_focus || [];
    const d = derivedByScene[scene.scene_id];
    const duration = d ? d.duration_seconds : (scene.duration_seconds || 5);
    const pointTimes = d ? d.points.map((p) => ({ start: p.start, end: p.end })) : [];

    await writeText(path.join(dir, "index.html"), sceneHtml({
      title: scene.title,
      eyebrow: copy.eyebrow || "WM & Co",
      headline: copy.headline || scene.title,
      subhead: copy.subhead || "",
      points,
      component: scene.component,
      transparent: scene.transparent,
    }));
    await writeText(path.join(dir, "styles.css"), sceneCss({ transparent: scene.transparent }));
    await writeText(path.join(dir, "animation.js"), animationJs({
      duration,
      pointCount: points.length || 4,
      barValues: scene.data_points || [54, 82, 68, 92],
      pointTimes,
    }));

    const timelines = d ? d.timelines : evenTimelines(scene.scene_id, points, duration);
    await writeJson(path.join(dir, "caption_timeline.json"), timelines.caption_timeline);
    await writeJson(path.join(dir, "focus_timeline.json"), timelines.focus_timeline);
    await writeJson(path.join(dir, "motion_timeline.json"), timelines.motion_timeline);
    await writeJson(path.join(dir, "beat_timeline.json"), timelines.beat_timeline);
    await writeJson(path.join(dir, "sfx_timeline.json"), {
      scene_id: scene.scene_id,
      sfx_events: points.flatMap((p, i) => {
        const t = d ? d.points[i].start : Number(((duration / Math.max(points.length, 1)) * i).toFixed(2));
        return [
          { time: Number((t).toFixed(2)), type: "soft_whoosh", mapped_asset_id: "sfx_fast_swoosh_pack", tied_to: `card_focus:${p}` },
          { time: Number((t + 0.3).toFixed(2)), type: "soft_click", mapped_asset_id: "sfx_fast_swoosh_pack", tied_to: `cursor_click:${p}` },
        ];
      }),
    });
    await writeJson(path.join(dir, "scene.json"), {
      scene_id: scene.scene_id,
      title: scene.title,
      duration_seconds: duration,
      timing_source: d ? d.timing_source : timingSource,
      width: plan.format?.width || 1920,
      height: plan.format?.height || 1080,
      fps: plan.format?.fps || 30,
      transparent: !!scene.transparent,
      intended_use: "motion_scene",
      render_mode: "frames",
      component: scene.component || "academy_dashboard",
    });
    generated.push(dir);
  }
  return { scenes: generated, timing_source: timingSource };
}

import path from "node:path";
import { readJson, taskPaths, writeJson } from "../project-fs.mjs";

function ivyInductionPlan(taskId) {
  const scenes = [
    {
      scene_id: "scene_001",
      title: "Welcome to WM Academy",
      duration_seconds: 25,
      component: "academy_dashboard",
      visual_focus: ["Ivy joins WM & Co", "Operations Assistant", "WM Academy induction"],
      copy: {
        eyebrow: "WM Academy",
        headline: "Welcome, Ivy",
        subhead: "Your induction into WM & Co operations.",
        points: ["WM & Co", "Operations Assistant", "First working rhythm"],
      },
    },
    {
      scene_id: "scene_002",
      title: "What WM & Co Is Building",
      duration_seconds: 29,
      component: "growth_engine",
      visual_focus: ["Visibility", "Systems", "AI integration", "Governance"],
      copy: {
        eyebrow: "Company Context",
        headline: "Structured growth infrastructure",
        subhead: "WM & Co helps teams move from scattered effort to visible, governed execution.",
        points: ["Visibility", "Systems", "AI integration", "Governance"],
      },
    },
    {
      scene_id: "scene_003",
      title: "The WM Growth Engine",
      duration_seconds: 31,
      component: "engine_diagram",
      visual_focus: ["Capture", "Organize", "Execute", "Review"],
      copy: {
        eyebrow: "Growth Engine",
        headline: "Work moves through the engine",
        subhead: "Tasks, projects, clients, and reporting are connected instead of scattered.",
        points: ["Capture demand", "Organize projects", "Execute tasks", "Review outcomes"],
      },
    },
    {
      scene_id: "scene_004",
      title: "How The Operating System Works",
      duration_seconds: 34,
      component: "workflow_lanes",
      visual_focus: ["Client", "Project", "Task", "Report"],
      copy: {
        eyebrow: "Operating System",
        headline: "Every item has a place",
        subhead: "Client work is tracked from intake through delivery, approval, and reporting.",
        points: ["Clients", "Projects", "Tasks", "Reports"],
      },
    },
    {
      scene_id: "scene_005",
      title: "Ivy's Role In Operations",
      duration_seconds: 32,
      component: "role_board",
      visual_focus: ["Visibility", "Follow-up", "Documentation", "Reporting"],
      copy: {
        eyebrow: "Role Clarity",
        headline: "Operations Assistant",
        subhead: "Your role helps work stay visible, organized, followed up, and completed.",
        points: ["Track work", "Coordinate follow-ups", "Document decisions", "Prepare reports"],
      },
    },
    {
      scene_id: "scene_006",
      title: "Daily And Weekly Rhythm",
      duration_seconds: 31,
      component: "rhythm_board",
      visual_focus: ["Daily check-in", "Task review", "Weekly reporting", "Learning loop"],
      copy: {
        eyebrow: "Working Rhythm",
        headline: "The system carries the work",
        subhead: "Use the operating rhythm to reduce memory load and increase follow-through.",
        points: ["Daily check-in", "Task review", "Weekly reporting", "Learning loop"],
      },
    },
    {
      scene_id: "scene_007",
      title: "Communication And Follow-through",
      duration_seconds: 28,
      component: "close_cta",
      visual_focus: ["Clear communication", "Documentation", "Follow-through", "Welcome"],
      copy: {
        eyebrow: "Welcome",
        headline: "Clarity, consistency, follow-through",
        subhead: "Welcome to the team. This is the beginning of a strong operations backbone.",
        points: ["Communicate clearly", "Document decisions", "Close the loop", "Keep learning"],
      },
    },
  ];
  return {
    task_id: taskId,
    mode: "motion_graphics",
    title: "Ivy Induction Video - WM Academy",
    brief: "A real internal production draft introducing Ivy to WM & Co, the WM Growth Engine, task operations, working rhythms, and expectations for the Operations Assistant role.",
    format: { width: 1920, height: 1080, fps: 30, aspect_ratio: "16:9" },
    voice: { required: true, voice_id: "wm_voice_female" },
    scenes,
    motion_language: {
      visual_focus_director: true,
      behaviors: [
        "active point moves forward and enlarges",
        "inactive points dim and recede",
        "supporting detail reveals during narration",
        "cursor movement and click rings",
        "connection lines and workflow lane motion",
        "status changes and report-card updates",
      ],
      timelines: ["motion_timeline.json", "focus_timeline.json", "sfx_timeline.json"],
    },
    assumptions: [
      "Internal academy draft only.",
      "Human review is required before publishing or external client use.",
      "Piper voice licensing remains review_required.",
    ],
    risks: [
      "Piper executable or selected voice files may be missing.",
      "Music and SFX license status requires human review before publishing.",
    ],
    next_actions: [
      "Generate voice script and wm_voice_female narration.",
      "Render motion scenes as frame sequences.",
      "Compile, deliver to local Drive-sync folder, and set draft ready.",
    ],
  };
}

// Ensure every scene carries narration text that CONTAINS its on-screen point
// phrases, so the voice-alignment step can lock each point to the moment it is
// spoken. Authored narration is respected; otherwise it is composed from the
// subhead + points.
function ensureNarration(plan) {
  for (const scene of plan.scenes || []) {
    if (scene.narration && String(scene.narration).trim()) continue;
    const copy = scene.copy || {};
    const points = copy.points || scene.visual_focus || [];
    const lead = copy.subhead || copy.headline || scene.title || "";
    scene.narration = [lead, points.join(". ")].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    if (scene.narration && !/[.!?]$/.test(scene.narration)) scene.narration += ".";
  }
  return plan;
}

export async function createMotionPlan(taskId) {
  const paths = taskPaths(taskId);
  if (/TASK-WMACADEMY-IVY-INDUCTION/i.test(taskId)) {
    const plan = ensureNarration(ivyInductionPlan(taskId));
    const file = path.join(paths.planning, "motion_plan.json");
    await writeJson(file, plan);
    return { path: file, plan };
  }
  const taskContext = readJson(path.join(paths.context, "task_context.json"), {});
  const task = taskContext.payload?.task || taskContext.task || {};
  const title = task.title || task.task_name || `Motion graphics draft for ${taskId}`;
  const description = task.description || task.task_description || "";
  const plan = {
    task_id: taskId,
    mode: "motion_graphics",
    title,
    brief: description,
    format: { width: 1920, height: 1080, fps: 30, aspect_ratio: "16:9" },
    scenes: [
      {
        scene_id: "scene_001",
        title,
        duration_seconds: 5,
        transparent: false,
        component: "title_card",
        copy: {
          eyebrow: "WM & Co",
          headline: title,
          subhead: description ? description.split(/\n+/)[0].slice(0, 140) : "Draft motion graphics scene."
        }
      }
    ],
    assumptions: ["Initial plan is a starter draft. Human should refine scene count and copy before production."],
    risks: ["Missing music/SFX may block final audio mix unless silent export is approved."],
    next_actions: ["Review the motion plan.", "Collect music/SFX or approve silent export.", "Run generate-scenes."]
  };
  ensureNarration(plan);
  const file = path.join(paths.planning, "motion_plan.json");
  await writeJson(file, plan);
  return { path: file, plan };
}

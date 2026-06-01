import path from "node:path";
import { ensureDir, readJson, taskPaths, writeJson, writeText } from "../project-fs.mjs";

function academyIvySegments() {
  return [
    {
      id: "vo_001",
      start_hint: 0,
      target_duration_seconds: 24,
      tone: "warm welcome",
      text: "Welcome to WM & Co. Ivy, this induction introduces the company you are joining, how we work, and how your role as Operations Assistant fits into the wider system. Think of this as your first guided map of the operating environment, the language we use, and the habits that make work easier to manage. You do not need to understand everything on day one. What matters is learning where work lives, how updates move, and how to keep the system clean.",
    },
    {
      id: "vo_002",
      start_hint: 24,
      target_duration_seconds: 27,
      tone: "clear context",
      text: "WM & Co helps businesses modernize how work gets done. We combine visibility, systems, AI integration, and governance so teams can move from scattered work to structured growth. The goal is not just to be busy. The goal is to build infrastructure that helps people see priorities, make decisions, and follow through. That means we care about clear task records, useful project folders, reliable reports, and a steady rhythm of review.",
    },
    {
      id: "vo_003",
      start_hint: 51,
      target_duration_seconds: 28,
      tone: "instructional",
      text: "The company operates through a system. Work is captured as tasks, organized under projects, linked to clients, supported by internal intelligence, and delivered through review and approval flows. When the system is used well, nothing important depends only on memory, chat history, or someone having to ask twice. A good update should make it obvious what changed, who owns the next step, and what needs attention.",
    },
    {
      id: "vo_004",
      start_hint: 79,
      target_duration_seconds: 27,
      tone: "growth engine",
      text: "The WM Growth Engine is the way we connect demand, strategy, execution, reporting, and improvement. A request becomes a task. Related tasks sit inside a project. Projects belong to clients. Reports show what moved, what is blocked, what needs review, and what should happen next. Your work helps this engine stay reliable by keeping details current, keeping folders orderly, and making sure loose ends are surfaced early.",
    },
    {
      id: "vo_005",
      start_hint: 106,
      target_duration_seconds: 27,
      tone: "role clarity",
      text: "As Operations Assistant, your role is to help make sure work is visible, organized, followed up, and completed. You support task tracking, client follow-ups, project coordination, documentation, and internal reporting. Sometimes that means checking whether a task has the right status. Sometimes it means confirming whether a file is in the right folder. Sometimes it means turning a conversation into a clean note that the team can act on.",
    },
    {
      id: "vo_006",
      start_hint: 133,
      target_duration_seconds: 28,
      tone: "steady operating rhythm",
      text: "You will work with the task operations system, project folders, client information, content calendars, reports, internal notes, and scheduled check-ins. The goal is not to remember everything manually. The system should carry the work. When you are unsure, look for the source of truth first: the task, the project folder, the client record, the report, or the latest approved note.",
    },
    {
      id: "vo_007",
      start_hint: 161,
      target_duration_seconds: 25,
      tone: "expectations",
      text: "The daily rhythm is simple. Check what is active. Notice what is waiting. Confirm owners and next steps. Document important updates. Escalate blockers early. At the end of the week, help turn activity into a clear picture of progress, priorities, and open loops. A strong operations rhythm makes the team calmer, faster, and more accurate because the next action is visible.",
    },
    {
      id: "vo_008",
      start_hint: 186,
      target_duration_seconds: 24,
      tone: "encouraging",
      text: "Success in this role comes from clarity, consistency, communication, documentation, follow-through, and learning the WM & Co way of working one rhythm at a time. Ask questions early, write things down, and close loops clearly. If something is unclear, your job is not to guess silently. Your job is to make the uncertainty visible so it can be resolved.",
    },
    {
      id: "vo_009",
      start_hint: 210,
      target_duration_seconds: 22,
      tone: "warm close",
      text: "Welcome to the team. This is the beginning of building a strong operations backbone for WM & Co and the clients we support.",
    },
  ];
}

function genericSegments(taskId, taskContext) {
  const title = taskContext?.title || taskContext?.task?.title || taskId;
  return [
    {
      id: "vo_001",
      start_hint: 0,
      target_duration_seconds: 12,
      tone: "warm introduction",
      text: `Welcome. This video introduces ${title} and explains the key ideas, operating context, and next steps.`,
    },
    {
      id: "vo_002",
      start_hint: 12,
      target_duration_seconds: 18,
      tone: "clear explanation",
      text: "The goal is to make the work easy to understand, easy to review, and easy to act on inside the WM & Co operating system.",
    },
    {
      id: "vo_003",
      start_hint: 30,
      target_duration_seconds: 12,
      tone: "closing",
      text: "Use this draft for review, feedback, and the next production pass before publishing or sharing externally.",
    },
  ];
}

// Build one voice segment per scene, in scene order, using each scene's
// narration. This keeps the spoken audio aligned 1:1 with the visual scenes so
// align-voice can lock motion + captions to the words. Falls back to the
// curated scripts only when no plan/narration is available.
function planSegments(plan) {
  const scenes = (plan?.scenes || []).filter((s) => s.narration && String(s.narration).trim());
  if (scenes.length === 0) return null;
  return scenes.map((s) => ({
    id: s.scene_id,
    scene_id: s.scene_id,
    target_duration_seconds: s.duration_seconds || null,
    tone: s.copy?.eyebrow || "narration",
    text: String(s.narration).trim(),
  }));
}

export async function createVoiceScript(taskId) {
  const paths = taskPaths(taskId);
  const taskContext = readJson(path.join(paths.context, "task_context.json"), {});
  const plan = readJson(path.join(paths.planning, "motion_plan.json"), null);
  const textBlob = JSON.stringify(taskContext).toLowerCase();
  const segments = planSegments(plan)
    || (/ivy|operations assistant|wm academy/.test(textBlob) || /ivy|wmacademy/i.test(taskId)
      ? academyIvySegments()
      : genericSegments(taskId, taskContext));
  const markdown = [
    `# Voiceover Script - ${taskId}`,
    "",
    ...segments.flatMap((segment) => [
      `## ${segment.id}`,
      "",
      `Tone: ${segment.tone}`,
      "",
      segment.text,
      "",
    ]),
  ].join("\n");
  await ensureDir(paths.voice);
  await writeText(path.join(paths.voice, "script.md"), markdown);
  await writeJson(path.join(paths.voice, "script_segments.json"), { task_id: taskId, segments });
  return {
    script: path.join(paths.voice, "script.md"),
    segments: path.join(paths.voice, "script_segments.json"),
    count: segments.length,
  };
}

import { attachTaskContext, setTaskStatus } from "../task-context.mjs";

export async function updateTaskDraftReady(taskId, summary) {
  const note = typeof summary === "string" ? summary : summary?.notes || `Video draft delivered for ${taskId}.`;
  const attached = await attachTaskContext(taskId, {
    title: "Video draft delivered",
    notes: note,
    url: summary?.folder || summary?.delivery_folder || undefined
  });
  const status = await setTaskStatus(taskId, "AI Draft Ready", note);
  return { attached, status };
}

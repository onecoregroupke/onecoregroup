import { attachTaskContext, setTaskStatus } from "../task-context.mjs";

export async function updateTaskDraftReady(taskId, summary) {
  const location = summary?.delivery_folder || summary?.folder || summary?.summary_path;
  const note = typeof summary === "string" ? summary : summary?.notes || `Video draft delivered for ${taskId}.${location ? ` Deliverable location: ${location}` : ""}`;
  const attached = await attachTaskContext(taskId, {
    title: "Video draft delivered",
    notes: note,
    url: location || undefined
  });
  const status = await setTaskStatus(taskId, "AI Draft Ready", note);
  return { attached, status };
}

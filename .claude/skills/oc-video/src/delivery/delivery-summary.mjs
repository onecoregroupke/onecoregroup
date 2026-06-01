import fs from "node:fs";
import path from "node:path";
import { copyFileToDir, findOrCreateWorkingFiles, findProjectFolder, readEnv, readJson, taskPaths, writeJson, writeText } from "../project-fs.mjs";

export async function deliverLocal(taskId, flags = {}) {
  const paths = taskPaths(taskId);
  const manifest = readJson(path.join(paths.planning, "render_manifest.json"), {});
  const taskContext = readJson(path.join(paths.context, "task_context.json"), {});
  const projectId = flags.project || taskContext.payload?.project_id || manifest.project_id || null;
  const env = readEnv();
  const root = flags.root || env.WM_LOCAL_CLIENTS_ROOT;
  const exports = fs.existsSync(paths.exports) ? fs.readdirSync(paths.exports).filter((f) => !f.startsWith(".")) : [];
  if (!exports.length) throw new Error("No files in exports/. Compile first.");
  const projectFolder = flags.folder || await findProjectFolder(root, projectId);
  if (!projectFolder) {
    const report = `# Missing Local Delivery Target - ${taskId}\n\nCould not resolve project folder.\n\n- WM_LOCAL_CLIENTS_ROOT: ${root || "(unset)"}\n- Project ID: ${projectId || "(unknown)"}\n\nSet WM_LOCAL_CLIENTS_ROOT, pass --folder, or deliver manually.\n`;
    await writeText(path.join(paths.logs, "missing-delivery-target.md"), report);
    return { ok: false, reason: "missing_local_delivery_target", report: path.join(paths.logs, "missing-delivery-target.md") };
  }
  const working = await findOrCreateWorkingFiles(projectFolder);
  const copied = [];
  for (const name of exports) {
    const src = path.join(paths.exports, name);
    if (fs.statSync(src).isFile()) {
      const dest = path.join(working, `${taskId}-${name}`);
      if (!flags["dry-run"]) fs.copyFileSync(src, dest);
      copied.push({ source: src, destination: dest });
    }
  }
  const summaryText = [
    `# Video Draft Delivery - ${taskId}`,
    "",
    `Delivery mode: local_drive_sync`,
    `Project folder: ${projectFolder}`,
    `Working files folder: ${working}`,
    "",
    "## Files",
    ...copied.map((item) => `- ${path.basename(item.destination)}`),
    "",
    "## Review",
    "Draft only. Human review required before publishing or marking complete.",
  ].join("\n");
  const summaryPath = path.join(working, `${taskId}-DELIVERY-SUMMARY.md`);
  if (!flags["dry-run"]) await writeText(summaryPath, summaryText);
  const delivery = {
    task_id: taskId,
    delivery_mode: "local_drive_sync",
    status: flags["dry-run"] ? "dry_run" : "delivered",
    delivered: !flags["dry-run"],
    project_folder: projectFolder,
    delivery_folder: working,
    summary_path: summaryPath,
    outputs: copied
  };
  if (!flags["dry-run"]) await writeJson(path.join(paths.planning, "delivery_manifest.json"), delivery);
  return { ok: true, dry_run: !!flags["dry-run"], summary: delivery };
}

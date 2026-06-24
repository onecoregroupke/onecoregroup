import fs from "node:fs";
import path from "node:path";
import { findOrCreateWorkingFiles, findProjectFolder, readEnv, readJson, taskPaths, writeJson, writeText } from "../project-fs.mjs";

export async function deliverLocal(taskId, flags = {}) {
  const paths = taskPaths(taskId);
  const manifest = readJson(path.join(paths.planning, "render_manifest.json"), {});
  const taskContext = readJson(path.join(paths.context, "task_context.json"), {});
  const projectId = flags.project || taskContext.payload?.project?.project_id || taskContext.payload?.project_id || manifest.project_id || null;
  const env = readEnv();
  const root = flags.root || env.OCG_LOCAL_DELIVERY_ROOT;
  const exports = fs.existsSync(paths.exports) ? fs.readdirSync(paths.exports).filter((f) => !f.startsWith(".")) : [];
  if (!exports.length) throw new Error("No files in exports/. Compile first.");
  let projectFolder = flags.folder || await findProjectFolder(root, projectId);
  let deliveryScope = "drive_sync";
  let setupReport = null;
  if (!projectFolder) {
    deliveryScope = "repo_local_fallback";
    projectFolder = paths.root;
    setupReport = path.join(paths.logs, "local-delivery-fallback.md");
    const report = `# Local Delivery Fallback - ${taskId}\n\nCould not resolve a synced project folder, so exports were delivered into the skill-local workspace.\n\n- OCG_LOCAL_DELIVERY_ROOT: ${root || "(unset)"}\n- Project ID: ${projectId || "(unknown)"}\n- Fallback folder: ${path.join(paths.root, "03_Working-Files")}\n\nTo connect Drive on this device, install/sign in to Google Drive Desktop and set OCG_LOCAL_DELIVERY_ROOT to the synced One Core Group delivery root. You can also pass --folder <project-folder>.\n`;
    if (!flags["dry-run"]) await writeText(setupReport, report);
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
    `Delivery scope: ${deliveryScope}`,
    `Project folder: ${projectFolder}`,
    `Working files folder: ${working}`,
    setupReport ? `Setup note: ${setupReport}` : null,
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
    delivery_scope: deliveryScope,
    status: flags["dry-run"] ? "dry_run" : "delivered",
    delivered: !flags["dry-run"],
    project_folder: projectFolder,
    delivery_folder: working,
    summary_path: summaryPath,
    setup_report: setupReport,
    outputs: copied
  };
  if (!flags["dry-run"]) await writeJson(path.join(paths.planning, "delivery_manifest.json"), delivery);
  return { ok: true, dry_run: !!flags["dry-run"], summary: delivery };
}

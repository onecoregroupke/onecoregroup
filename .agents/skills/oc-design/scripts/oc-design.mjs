#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECTS_ROOT = path.join(SKILL_ROOT, 'projects');
const REPO_ROOT = path.resolve(SKILL_ROOT, '..', '..', '..');
const DEFAULT_OPEN_DESIGN_ROOT = 'C:\\Cognexa Co\\00_TOOLS\\open-design';
const OC_OPS_CLI = path.join(REPO_ROOT, 'scripts', 'oc-ops.mjs');
const DEFAULT_DAEMON_URL = 'http://127.0.0.1:17456';
const LOCAL_ENV_PATH = path.join(REPO_ROOT, 'apps', 'ops-hub', '.env.local');

if (fs.existsSync(LOCAL_ENV_PATH)) process.loadEnvFile(LOCAL_ENV_PATH);

main().catch((err) => {
  print({ ok: false, error: String(err?.message || err) });
  process.exitCode = 1;
});

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  await fsp.mkdir(PROJECTS_ROOT, { recursive: true });

  switch (command) {
    case 'doctor':
      return print(await doctor(args));
    case 'init':
      return print(await initProject(args));
    case 'route':
      return print(await routeOpenDesign(args));
    case 'collect':
      return print(await collect(args));
    case 'deliver':
      return print(await deliver(args));
    case 'status':
      return print(await status(args));
    case 'help':
    case undefined:
      return print({ ok: true, usage: usage() });
    default:
      throw new Error(`unknown command: ${command}`);
  }
}

function usage() {
  return [
    'node .claude/skills/oc-design/scripts/oc-design.mjs doctor',
    'node .claude/skills/oc-design/scripts/oc-design.mjs init --task TASK-XXXX --type brand_guidelines [--provider open_design]',
    'node .claude/skills/oc-design/scripts/oc-design.mjs route --task TASK-XXXX [--daemon-url http://127.0.0.1:17456]',
    'node .claude/skills/oc-design/scripts/oc-design.mjs collect --task TASK-XXXX --source <file-or-folder>',
    'node .claude/skills/oc-design/scripts/oc-design.mjs deliver --task TASK-XXXX [--folder <project-folder>] [--delivery-name <folder-name>]',
    'node .claude/skills/oc-design/scripts/oc-design.mjs status --task TASK-XXXX',
  ];
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function requireTask(args) {
  const task = String(args.task || '').trim().toUpperCase();
  if (!/^TASK-\d{4,}$/.test(task)) throw new Error('--task TASK-XXXX is required');
  return task;
}

function taskRoot(task) {
  return path.join(PROJECTS_ROOT, task);
}

async function doctor(args) {
  const openDesignRoot = path.resolve(String(args.openDesignRoot || process.env.OPEN_DESIGN_ROOT || DEFAULT_OPEN_DESIGN_ROOT));
  const daemonUrl = String(args.daemonUrl || process.env.OD_DAEMON_URL || DEFAULT_DAEMON_URL);
  const health = await fetchJson(`${daemonUrl}/api/health`, { timeoutMs: 2500 }).catch((err) => ({
    ok: false,
    error: String(err.message || err),
  }));
  const repo = {
    exists: fs.existsSync(openDesignRoot),
    path: openDesignRoot,
    package_json: fs.existsSync(path.join(openDesignRoot, 'package.json')),
    data_dir: fs.existsSync(path.join(openDesignRoot, '.od')),
  };
  const ocOps = {
    exists: fs.existsSync(OC_OPS_CLI),
    path: OC_OPS_CLI,
  };
  const deliveryRoot = process.env.OCG_LOCAL_DELIVERY_ROOT || '';
  const localDelivery = {
    exists: Boolean(deliveryRoot && fs.existsSync(deliveryRoot)),
    path: deliveryRoot || null,
  };
  return {
    ok: true,
    provider: 'open_design',
    daemon_url: daemonUrl,
    daemon_health: health,
    open_design: repo,
    oc_ops: ocOps,
    local_delivery: localDelivery,
  };
}

async function initProject(args) {
  const task = requireTask(args);
  const type = String(args.type || 'brand_guidelines');
  const provider = String(args.provider || 'open_design');
  const root = taskRoot(task);
  const dirs = ['brief', 'handoff', 'exports', 'logs', 'provider', 'source'];
  for (const dir of dirs) await fsp.mkdir(path.join(root, dir), { recursive: true });

  const taskContext = await lookupTask(task).catch((err) => ({ ok: false, error: String(err.message || err) }));
  const brief = buildBrief({ task, type, provider, taskContext });
  const openPrompt = buildOpenDesignPrompt({ task, type, taskContext });
  const claudePrompt = buildClaudeDesignPrompt({ task, type, taskContext });
  const checklist = buildExportChecklist({ task, type });
  const manifest = {
    task_id: task,
    type,
    provider,
    created_at: new Date().toISOString(),
    status: 'initialized',
    files: {
      brief: 'brief/DESIGN-BRIEF.md',
      open_design_prompt: 'handoff/PROMPT-FOR-OPEN-DESIGN.md',
      claude_design_prompt: 'handoff/PROMPT-FOR-CLAUDE-DESIGN.md',
      export_checklist: 'handoff/EXPORT-CHECKLIST.md',
    },
  };

  await writeText(path.join(root, 'brief', 'DESIGN-BRIEF.md'), brief);
  await writeText(path.join(root, 'handoff', 'PROMPT-FOR-OPEN-DESIGN.md'), openPrompt);
  await writeText(path.join(root, 'handoff', 'PROMPT-FOR-CLAUDE-DESIGN.md'), claudePrompt);
  await writeText(path.join(root, 'handoff', 'EXPORT-CHECKLIST.md'), checklist);
  await writeJson(path.join(root, 'design_manifest.json'), manifest);
  await writeJson(path.join(root, 'task_context_preview.json'), taskContext);

  return { ok: true, task_id: task, root, provider, type, manifest };
}

async function routeOpenDesign(args) {
  const task = requireTask(args);
  const root = taskRoot(task);
  await assertProject(root);
  const daemonUrl = String(args.daemonUrl || process.env.OD_DAEMON_URL || DEFAULT_DAEMON_URL).replace(/\/$/, '');
  const projectId = String(args.projectId || `ocg-${task.toLowerCase()}`);
  const name = String(args.name || `${task} OCG Design`);

  const health = await fetchJson(`${daemonUrl}/api/health`, { timeoutMs: 3000 }).catch((err) => ({
    ok: false,
    error: String(err.message || err),
  }));
  const route = {
    task_id: task,
    provider: 'open_design',
    daemon_url: daemonUrl,
    project_id: projectId,
    project_name: name,
    local_project_folder: root,
    routed_at: new Date().toISOString(),
    imported: false,
    health,
  };

  if (health?.ok !== false && !health?.error) {
    const body = {
      baseDir: root,
      name,
      skillId: String(args.skill || 'magazine-poster'),
      designSystemId: args.designSystem || null,
    };
    const imported = await fetchJson(`${daemonUrl}/api/import/folder`, {
      method: 'POST',
      body,
      timeoutMs: 10000,
    });
    route.imported = true;
    route.open_design_project = imported;
    route.project_id = imported?.project?.id || projectId;
    route.open_url = `${daemonUrl.replace(/:\d+$/, ':17573')}/`;
  } else {
    route.blocker = 'Open Design daemon is not reachable. Start Open Design, then rerun route.';
  }

  await writeJson(path.join(root, 'provider', 'open_design_route.json'), route);
  return { ok: true, ...route };
}

async function collect(args) {
  const task = requireTask(args);
  const source = args.source ? path.resolve(String(args.source)) : '';
  if (!source || !fs.existsSync(source)) throw new Error('--source must be an existing file or folder');
  const root = taskRoot(task);
  await assertProject(root);
  const exportsDir = path.join(root, 'exports');
  await fsp.mkdir(exportsDir, { recursive: true });
  const stat = await fsp.stat(source);
  const copied = [];

  if (stat.isDirectory()) {
    const entries = await fsp.readdir(source);
    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      const src = path.join(source, entry);
      const dest = path.join(exportsDir, entry);
      await fsp.cp(src, dest, { recursive: true, force: true });
      copied.push(dest);
    }
  } else {
    const dest = path.join(exportsDir, path.basename(source));
    await fsp.copyFile(source, dest);
    copied.push(dest);
  }

  const report = { task_id: task, collected_at: new Date().toISOString(), source, copied };
  await writeJson(path.join(root, 'provider', 'collect_report.json'), report);
  return { ok: true, ...report };
}

async function deliver(args) {
  const task = requireTask(args);
  const root = taskRoot(task);
  await assertProject(root);
  const exportsDir = path.join(root, 'exports');
  if (!fs.existsSync(exportsDir)) throw new Error('exports folder is missing');
  const files = await listFilesRecursive(exportsDir);
  if (files.length === 0) throw new Error('exports folder is empty; run collect or place final draft files in exports');

  const lookup = await lookupTask(task).catch((err) => ({ ok: false, error: String(err.message || err) }));
  const projectFolder = args.folder ? path.resolve(String(args.folder)) : await resolveDeliveryProjectFolder(lookup);
  if (!projectFolder || !fs.existsSync(projectFolder)) {
    const report = { ok: false, reason: 'missing_local_delivery_target', project_folder: projectFolder || null, task_lookup: lookup };
    await writeJson(path.join(root, 'logs', 'missing-delivery-target.json'), report);
    return report;
  }

  const taskTitle = lookup?.payload?.task?.task_name || 'Design Delivery';
  const deliveryName = sanitizePathSegment(String(args.deliveryName || `${task} ${taskTitle}`));
  const deliveryFolder = path.join(projectFolder, deliveryName);
  await fsp.mkdir(deliveryFolder, { recursive: true });
  const outputs = [];
  for (const file of files) {
    const rel = path.relative(exportsDir, file);
    const safeName = `${task}-${rel}`.replace(/[\\\/]+/g, '-');
    const dest = path.join(deliveryFolder, safeName);
    await fsp.copyFile(file, dest);
    outputs.push({ source: file, destination: dest });
  }

  const summaryPath = path.join(deliveryFolder, `${task}-DESIGN-DELIVERY-SUMMARY.md`);
  const summary = buildDeliverySummary({ task, lookup, outputs, deliveryFolder });
  await writeText(summaryPath, summary);
  outputs.push({ source: path.join(root, 'delivery-summary-generated'), destination: summaryPath });

  const attach = await attachTaskContext(task, {
    title: 'Design draft delivered',
    url: deliveryFolder,
    notes: `Design draft delivered for ${task}. Files delivered to local Drive-sync folder. Human review required before external sharing or publishing.`,
  }).catch((err) => ({ ok: false, error: String(err.message || err) }));
  const status = await setTaskStatus(task, 'AI Draft Ready', 'Design draft delivered for human review.').catch((err) => ({
    ok: false,
    error: String(err.message || err),
  }));

  const delivery = {
    task_id: task,
    delivery_mode: 'local_drive_sync',
    status: 'delivered',
    delivered: true,
    project_folder: projectFolder,
    delivery_folder: deliveryFolder,
    summary_path: summaryPath,
    outputs,
    task_ops: { attach, status },
  };
  await writeJson(path.join(root, 'delivery_manifest.json'), delivery);
  return { ok: true, summary: delivery };
}

async function status(args) {
  const task = requireTask(args);
  const root = taskRoot(task);
  const exists = fs.existsSync(root);
  const exportsDir = path.join(root, 'exports');
  return {
    ok: true,
    task_id: task,
    root,
    exists,
    files: exists ? {
      manifest: fs.existsSync(path.join(root, 'design_manifest.json')),
      open_design_route: fs.existsSync(path.join(root, 'provider', 'open_design_route.json')),
      collect_report: fs.existsSync(path.join(root, 'provider', 'collect_report.json')),
      delivery_manifest: fs.existsSync(path.join(root, 'delivery_manifest.json')),
      exports: fs.existsSync(exportsDir) ? (await listFilesRecursive(exportsDir)).length : 0,
    } : {},
  };
}

function buildBrief({ task, type, provider, taskContext }) {
  const payload = taskContext?.payload || {};
  const taskInfo = payload.task || {};
  const project = payload.project || {};
  const brand = payload.brand || {};
  return `# Design Brief - ${task}

## Task
- Title: ${taskInfo.task_name || '[Task title unavailable]'}
- Type: ${type}
- Provider: ${provider}
- Status: Draft production only

## Brand / Project
- Brand: ${brand.name || '[Brand unavailable]'}
- Project: ${project.project_name || '[Project unavailable]'}

## Task Description
${taskInfo.task_description || '[No task description supplied]'}

## Required Output
- Editable design source or Open Design project files
- Export-ready draft files
- PNG/JPG previews where relevant
- PDF for brand guideline/deck-style work when relevant
- SVG/transparent assets when relevant
- Delivery summary and review notes

## Review Guardrails
- Do not publish.
- Do not send externally.
- Do not mark the task completed.
- Mark as AI Draft Ready only after local delivery.
`;
}

function buildOpenDesignPrompt({ task, type, taskContext }) {
  const payload = taskContext?.payload || {};
  const taskInfo = payload.task || {};
  const project = payload.project || {};
  const brand = payload.brand || {};
  return `You are producing a One Core Group design draft inside Open Design.

Task: ${task}
Design type: ${type}
Brand: ${brand.name || '[Brand unavailable]'}
Project: ${project.project_name || '[Project unavailable]'}
Task title: ${taskInfo.task_name || '[Task title unavailable]'}

Read the local files in this project folder first:
- brief/DESIGN-BRIEF.md
- handoff/EXPORT-CHECKLIST.md

Create a polished draft package suitable for human review.

For brand guidelines or brand system work, include:
- Brand foundation and strategic positioning
- Logo usage rules or placeholders if logo files are not provided
- Color palette with accessibility notes
- Typography hierarchy
- Layout/grid principles
- Imagery/graphic style
- Social media examples
- Motion/video overlay rules when useful
- Export checklist

Expected files:
- index.html or editable source files
- brand-guidelines.pdf if export is available
- preview PNG/JPG files
- brand-tokens.json when a token system is relevant
- SVG files for reusable graphics or overlays when relevant
- REVIEW-NOTES.md

Constraints:
- Draft-only.
- Do not publish.
- Do not claim unsupported brand facts.
- Mark unknowns as [TO CONFIRM].
- Keep all generated files inside the Open Design project folder.
`;
}

function buildClaudeDesignPrompt({ task, type, taskContext }) {
  const payload = taskContext?.payload || {};
  return `Claude Design handoff for ${task}.

Use this only as a browser/manual handoff because Claude Design does not currently expose a public product API for project creation/export.

Task title: ${payload.task?.task_name || '[Task title unavailable]'}
Design type: ${type}

Paste the Open Design prompt or DESIGN-BRIEF.md into Claude Design, generate the draft, export the source/ZIP/PDF/PPTX/PNG assets, then use:

node .claude/skills/oc-design/scripts/oc-design.mjs collect --task ${task} --source "<downloaded-export-folder-or-file>"
node .claude/skills/oc-design/scripts/oc-design.mjs deliver --task ${task}
`;
}

function buildExportChecklist({ task, type }) {
  return `# Export Checklist - ${task}

- [ ] Editable source/design project exported or kept in Open Design
- [ ] PDF exported for guideline/deck-style work when relevant
- [ ] PNG/JPG previews exported
- [ ] SVG/transparent assets exported when relevant
- [ ] Brand tokens JSON exported when relevant
- [ ] REVIEW-NOTES.md included
- [ ] Human review required before publishing
- [ ] Task should be AI Draft Ready after delivery, not Completed

Design type: ${type}
`;
}

function buildDeliverySummary({ task, lookup, outputs, deliveryFolder }) {
  const payload = lookup?.payload || {};
  return `# ${task} Design Delivery Summary

## Task
- Title: ${payload.task?.task_name || '[Task title unavailable]'}
- Status: AI Draft Ready / human review required

## Delivery Folder
${deliveryFolder}

## Delivered Files
${outputs.map((o) => `- ${path.basename(o.destination)}`).join('\n')}

## Notes
- Draft-only delivery.
- Do not publish or send externally until human approval.
- Any missing brand assets, legal usage rules, or final copy should be marked during review.
`;
}

async function lookupTask(task) {
  return runOcOps(['lookup-task', task]);
}

async function attachTaskContext(task, { title, url, notes }) {
  return runOcOps(['attach-context', '--task', task, '--title', title, '--type', 'note', '--url', url, '--notes', notes]);
}

async function setTaskStatus(task, status, note) {
  return runOcOps(['set-status', task, '--status', status, '--note', note]);
}

async function runOcOps(args) {
  if (!fs.existsSync(OC_OPS_CLI)) throw new Error(`oc-ops CLI not found: ${OC_OPS_CLI}`);
  const result = await runProcess('node', [OC_OPS_CLI, ...args], { cwd: REPO_ROOT, timeoutMs: 120000 });
  const parsed = parseFirstJson(result.stdout);
  if (parsed) return parsed;
  if (result.code !== 0) throw new Error(result.stderr || result.stdout || `oc-ops exited ${result.code}`);
  return { ok: true, stdout: result.stdout.trim() };
}

async function resolveDeliveryProjectFolder(lookup) {
  const payload = lookup?.payload || {};
  const projectId = payload.project?.project_id;
  const deliveryRoot = process.env.OCG_LOCAL_DELIVERY_ROOT;
  if (!projectId || !deliveryRoot || !fs.existsSync(deliveryRoot)) return null;
  return findDirectoryByPrefix(deliveryRoot, projectId);
}

async function findDirectoryByPrefix(parent, prefix) {
  const entries = await fsp.readdir(parent, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const full = path.join(parent, entry.name);
    if (entry.name.toUpperCase().startsWith(prefix.toUpperCase())) return full;
    const nested = await findDirectoryByPrefix(full, prefix);
    if (nested) return nested;
  }
  return null;
}

function sanitizePathSegment(value) {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
  return sanitized || 'Design Delivery';
}

async function assertProject(root) {
  if (!fs.existsSync(root)) throw new Error(`project not initialized: ${root}`);
}

async function listFilesRecursive(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  async function walk(dir) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out.push(full);
    }
  }
  await walk(root);
  return out;
}

async function writeText(file, content) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, content, 'utf8');
}

async function writeJson(file, value) {
  await writeText(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 10000);
  try {
    const init = {
      method: options.method || 'GET',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
    };
    if (options.body !== undefined) init.body = JSON.stringify(options.body);
    const res = await fetch(url, init);
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status} ${res.statusText}`);
      err.body = body;
      throw err;
    }
    return body ?? { ok: true };
  } finally {
    clearTimeout(timeout);
  }
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      shell: false,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill();
      stderr += `\nProcess timed out after ${options.timeoutMs}ms`;
    }, options.timeoutMs || 30000);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
  });
}

function parseFirstJson(text) {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(text.slice(start, i + 1));
      }
    }
  }
  return null;
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

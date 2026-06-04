#!/usr/bin/env node
/**
 * oc-ops.mjs — repo-native CLI for the One Core Group Ops Hub agent API.
 *
 * Lets ANY agentic tool in this monorepo (Claude Code, Cowork, Codex, a worker)
 * do the same things across all 6 OCG brands: fetch tasks, create clients /
 * projects / tasks, submit drafts that get delivered to Drive, and move tasks
 * through the lifecycle. Brand-aware: pass --brand <slug> to scope work.
 *
 * It calls the deployed Ops Hub at OPS_OPS_BASE_URL using OPS_AGENT_API_KEY,
 * resolved from process.env first, then from .env.local at the repo root or in
 * apps/ops-hub. The key never needs to be typed into a command or a chat.
 *
 * Node 18+ (global fetch). No dependencies.
 *
 * Usage:
 *   node scripts/oc-ops.mjs <command> [options]
 *   node scripts/oc-ops.mjs help
 *
 * Brands (slugs): nairobi-piano-technicians, glitz-n-glim, nuuranest-stays,
 *                 ar-rayyan-playhouse, rhythms-college, darul-swafa
 *
 * Valid statuses: Not Started, Ongoing, AI Draft Ready, Edit Requested,
 *                 Approved, Completed, Blocked, Partially Completed
 */

import dns from 'node:dns'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// IPv6 → IPv4 fallback — required on some Windows hosts where Node's global
// fetch fails with "fetch failed" against IPv4-only Vercel deployments.
dns.setDefaultResultOrder('ipv4first')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const TIMEOUT_MS = 90_000

// ── credentials ──────────────────────────────────────────────
function readEnvFile(file) {
  const out = {}
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#') || !t.includes('=')) continue
      const i = t.indexOf('=')
      const key = t.slice(0, i).trim()
      let val = t.slice(i + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      out[key] = val
    }
  } catch {
    /* file may not exist */
  }
  return out
}

function resolveCreds() {
  const fromFiles = {
    ...readEnvFile(path.join(REPO_ROOT, '.env.local')),
    ...readEnvFile(path.join(REPO_ROOT, 'apps', 'ops-hub', '.env.local')),
  }
  const base =
    process.env.OPS_OPS_BASE_URL ||
    process.env.NEXT_PUBLIC_OPS_URL ||
    fromFiles.OPS_OPS_BASE_URL ||
    fromFiles.NEXT_PUBLIC_OPS_URL ||
    'http://localhost:3030'
  const key = process.env.OPS_AGENT_API_KEY || fromFiles.OPS_AGENT_API_KEY || ''
  return { base: base.replace(/\/$/, ''), key }
}

// ── arg parsing ──────────────────────────────────────────────
function parseArgs(argv) {
  const positionals = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const name = a.slice(2)
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) {
        flags[name] = true
      } else {
        flags[name] = next
        i++
      }
    } else {
      positionals.push(a)
    }
  }
  return { positionals, flags }
}

function readContent(flags) {
  if (flags['content-file']) return fs.readFileSync(flags['content-file'], 'utf8')
  if (typeof flags.content === 'string') return flags.content
  return undefined
}

// ── request helper ───────────────────────────────────────────
async function request(method, urlPath, body) {
  const { base, key } = resolveCreds()
  if (!key) {
    return out({
      ok: false,
      error:
        'OPS_AGENT_API_KEY missing. Add it to .env.local (root or apps/ops-hub) or the environment.',
    })
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${base}${urlPath}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-ops-agent-key': key,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    })
    let data
    try {
      data = await res.json()
    } catch {
      data = { ok: false, error: `Non-JSON response (HTTP ${res.status})` }
    }
    return out(data)
  } catch (e) {
    return out({ ok: false, error: `Request failed: ${e.message}` })
  } finally {
    clearTimeout(timer)
  }
}

function out(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n')
  return obj.ok === false ? 1 : 0
}

function q(params) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') sp.set(k, String(v))
  const s = sp.toString()
  return s ? `?${s}` : ''
}

// ── commands ─────────────────────────────────────────────────
const HELP = `oc-ops — One Core Group Ops Hub CLI

  list-work [--brand <slug>] [--project PROJ-XXX] [--status "Ongoing"] [--limit 20]
  lookup-task <TASK-ID>
  create-client "<Name>" [--industry ..] [--country-city ..]
  create-project "<Name>" (--brand <slug> | --client CLIENT-XXX) [--service-line ..] [--notes ..]
  create-task "<Name>" --project PROJ-XXX [--priority Medium] [--target-date YYYY-MM-DD]
              [--assigned-to ..] [--category ..] [--description ..] [--agent-eligible Yes|No]
  run-specialist <TASK-ID> --specialist <type>            # internal types draft inline
  submit-artifact --task TASK-XXXX --specialist <type> --title "<t>"
                  (--content "<md>" | --content-file <path>) [--summary ..] [--no-deliver]
  set-status <TASK-ID> --status "<status>" [--note ..]
  approve-artifact <artifact_id> [--status ..] [--note ..]
  attach-context --task TASK-XXXX --title "<t>" [--type note] [--url ..] [--notes ..]
  get-project-context <PROJ-ID>
  set-project-context <PROJ-ID> [--ideal ..] [--done ..] [--satisfaction ..]
                      [--code-refs ..] [--append ..] [--mode replace --content-file <path>]

Specialist types: analysis, research, report, proposal, content, video_clipping,
                  design_deck, client_communication, email_draft, project_admin, finance
`

async function main() {
  const [, , cmd, ...rest] = process.argv
  const { positionals, flags } = parseArgs(rest)

  switch (cmd) {
    case 'list-work':
      return request(
        'GET',
        `/api/agent/tasks/eligible${q({
          brand: flags.brand,
          project: flags.project,
          status: flags.status,
          limit: flags.limit,
        })}`,
      )

    case 'lookup-task': {
      const id = positionals[0]
      if (!id) return out({ ok: false, error: 'usage: lookup-task <TASK-ID>' })
      return request('GET', `/api/agent/tasks/${encodeURIComponent(id)}/context`)
    }

    case 'create-client': {
      const name = positionals[0]
      if (!name) return out({ ok: false, error: 'usage: create-client "<Name>"' })
      return request('POST', '/api/agent/clients', {
        client_name: name,
        industry: flags.industry,
        country_city: flags['country-city'],
      })
    }

    case 'create-project': {
      const name = positionals[0]
      if (!name) return out({ ok: false, error: 'usage: create-project "<Name>" (--brand <slug> | --client CLIENT-XXX)' })
      if (!flags.brand && !flags.client) {
        return out({ ok: false, error: 'provide --brand <slug> or --client CLIENT-XXX' })
      }
      return request('POST', '/api/agent/projects', {
        project_name: name,
        brand: flags.brand,
        client_id: flags.client,
        service_line: flags['service-line'],
        notes: flags.notes,
      })
    }

    case 'create-task': {
      const name = positionals[0]
      if (!name || !flags.project) {
        return out({ ok: false, error: 'usage: create-task "<Name>" --project PROJ-XXX' })
      }
      return request('POST', '/api/agent/tasks', {
        task_name: name,
        project_id: flags.project,
        priority: flags.priority,
        target_date: flags['target-date'],
        assigned_to: flags['assigned-to'],
        category: flags.category,
        task_description: flags.description,
        agent_eligible: flags['agent-eligible'],
      })
    }

    case 'run-specialist': {
      const id = positionals[0]
      if (!id || !flags.specialist) {
        return out({ ok: false, error: 'usage: run-specialist <TASK-ID> --specialist <type>' })
      }
      return request('POST', '/api/agent/run', { taskId: id, specialist: flags.specialist })
    }

    case 'submit-artifact': {
      const content = readContent(flags)
      if (!flags.task || !flags.specialist || !flags.title || !content) {
        return out({
          ok: false,
          error: 'usage: submit-artifact --task TASK-XXXX --specialist <type> --title "<t>" (--content ..|--content-file ..)',
        })
      }
      return request('POST', '/api/agent/artifacts', {
        task: flags.task,
        specialist: flags.specialist,
        title: flags.title,
        content,
        summary: flags.summary,
        deliver: !flags['no-deliver'],
      })
    }

    case 'set-status': {
      const id = positionals[0]
      if (!id || !flags.status) {
        return out({ ok: false, error: 'usage: set-status <TASK-ID> --status "<status>" [--note ..]' })
      }
      return request('POST', `/api/agent/tasks/${encodeURIComponent(id)}/status`, {
        status: flags.status,
        note: flags.note,
      })
    }

    case 'approve-artifact': {
      const id = positionals[0]
      if (!id) return out({ ok: false, error: 'usage: approve-artifact <artifact_id>' })
      return request('POST', `/api/agent/artifacts/${encodeURIComponent(id)}/approve`, {
        status: flags.status,
        note: flags.note,
      })
    }

    case 'attach-context': {
      if (!flags.task || !flags.title) {
        return out({ ok: false, error: 'usage: attach-context --task TASK-XXXX --title "<t>"' })
      }
      return request('POST', `/api/agent/tasks/${encodeURIComponent(flags.task)}/attach-context`, {
        title: flags.title,
        type: flags.type,
        url: flags.url,
        notes: flags.notes,
      })
    }

    case 'get-project-context': {
      const id = positionals[0]
      if (!id) return out({ ok: false, error: 'usage: get-project-context <PROJ-ID>' })
      return request('GET', `/api/agent/projects/${encodeURIComponent(id)}/context`)
    }

    case 'set-project-context': {
      const id = positionals[0]
      if (!id) return out({ ok: false, error: 'usage: set-project-context <PROJ-ID> [flags]' })
      const body = {
        ideal: flags.ideal,
        done: flags.done,
        satisfaction: flags.satisfaction,
        code_refs: flags['code-refs'],
        append: flags.append,
      }
      if (flags.mode === 'replace') {
        body.mode = 'replace'
        body.content = readContent(flags) ?? ''
      }
      return request('POST', `/api/agent/projects/${encodeURIComponent(id)}/context`, body)
    }

    case 'help':
    case undefined:
      process.stdout.write(HELP)
      return 0

    default:
      return out({ ok: false, error: `Unknown command: ${cmd}. Run "oc-ops help".` })
  }
}

main().then((code) => process.exit(typeof code === 'number' ? code : 0))

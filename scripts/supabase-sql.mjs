#!/usr/bin/env node
// Run SQL against the OCG Supabase project via the Management API.
//
//   node scripts/supabase-sql.mjs --file packages/db/migrations/055_x.sql
//   node scripts/supabase-sql.mjs --query "select 1"
//   node scripts/supabase-sql.mjs --tables            # list public tables
//
// Reads SUPABASE_ACCESS_TOKEN + NEXT_PUBLIC_SUPABASE_URL from process.env or
// .env.local (root or apps/ops-hub). Never hard-code the token.

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnv() {
  const files = ['.env.local', 'apps/ops-hub/.env.local']
  const env = { ...process.env }
  for (const f of files) {
    const p = resolve(ROOT, f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
      if (!m) continue
      const key = m[1]
      let val = m[2].trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!env[key]) env[key] = val
    }
  }
  return env
}

const env = loadEnv()
const token = env.SUPABASE_ACCESS_TOKEN
const url = env.NEXT_PUBLIC_SUPABASE_URL || ''
const ref = (/https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(url) || [])[1]

if (!token) { console.error('SUPABASE_ACCESS_TOKEN not found in env or .env.local'); process.exit(1) }
if (!ref) { console.error(`Could not derive project ref from NEXT_PUBLIC_SUPABASE_URL (${url || 'unset'})`); process.exit(1) }

export async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 4000)}`)
  try { return JSON.parse(text) } catch { return text }
}

const TABLES_SQL = `
  select table_name
  from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE'
  order by table_name`

async function main() {
  const args = process.argv.slice(2)
  const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }

  let sql = null
  let label = ''
  if (args.includes('--tables')) { sql = TABLES_SQL; label = 'public tables' }
  else if (flag('--file')) {
    const p = resolve(ROOT, flag('--file'))
    sql = readFileSync(p, 'utf8')
    label = flag('--file')
  } else if (flag('--query')) { sql = flag('--query'); label = 'query' }
  else { console.error('Usage: --file <path> | --query <sql> | --tables'); process.exit(1) }

  process.stderr.write(`→ project ${ref} · ${label}\n`)
  const out = await runSql(sql)
  console.log(JSON.stringify(out, null, 2))
}

// Windows-safe "am I the entrypoint?" check (file:// vs file:/// differs by platform).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(String(e.message || e)); process.exit(1) })
}

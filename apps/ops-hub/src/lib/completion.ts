import crypto from 'node:crypto'
import { db, nowIso } from './serverClient'
import type { OpsCompletionRecordRow } from '@ocg/db'

function secret(): string {
  const s = process.env['OPS_TASK_TOKEN_SECRET']
  if (!s) throw new Error('OPS_TASK_TOKEN_SECRET is not set')
  return s
}

/** HMAC-SHA256(taskId:targetDate, secret) — the no-login completion token. */
export function completionToken(taskId: string, targetDate: string): string {
  return crypto.createHmac('sha256', secret()).update(`${taskId}:${targetDate}`).digest('hex')
}

/** Timing-safe verification. Token expires 14 days after the target date. */
export function verifyCompletionToken(
  taskId: string,
  targetDate: string,
  token: string,
): { valid: boolean; reason?: string } {
  let expected: string
  try {
    expected = completionToken(taskId, targetDate)
  } catch {
    return { valid: false, reason: 'server_misconfigured' }
  }
  const a = Buffer.from(token)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: 'invalid_token' }
  }
  if (targetDate) {
    const expiry = new Date(targetDate)
    expiry.setDate(expiry.getDate() + 14)
    if (Date.now() > expiry.getTime()) return { valid: false, reason: 'expired' }
  }
  return { valid: true }
}

export function completionUrl(taskId: string, token: string): string {
  const base = process.env['NEXT_PUBLIC_OPS_URL'] ?? 'http://localhost:3030'
  return `${base}/complete?task=${encodeURIComponent(taskId)}&token=${token}`
}

export interface CompletionInput {
  task_id: string
  completion_date: string
  status?: string
  summary?: string
  outcome?: string
  blockers_notes?: string
  file_urls?: string[]
  submitted_by?: string
}

export async function recordCompletion(input: CompletionInput): Promise<OpsCompletionRecordRow> {
  const row = {
    task_id: input.task_id,
    completion_date: input.completion_date,
    status: input.status ?? 'Completed',
    summary: input.summary ?? '',
    outcome: input.outcome ?? '',
    blockers_notes: input.blockers_notes ?? '',
    file_urls: input.file_urls ?? [],
    submitted_by: input.submitted_by ?? '',
    submitted_at: nowIso(),
  }
  const { data, error } = await db()
    .from('ops_completion_records')
    .insert(row)
    .select('*')
    .single()
  if (error) throw new Error(`recordCompletion failed: ${error.message}`)
  return data as OpsCompletionRecordRow
}

import Groq from 'groq-sdk'
import { db } from './serverClient'
import { sendReport } from './email'
import { brandMap } from './brands'
import { listTeam } from './team'
import { dutyProgressByPerson } from './duties'
import type { OpsTaskRow, OpsCompletionRecordRow, OpsTaskCommentRow } from '@ocg/db'

// =============================================================================
// Ops reporting — daily / weekly / monthly operations digests with an AI
// narration. THIS is the only place the Ops Hub uses Groq (Llama 3.3). The task
// agent is driven by Codex/Hermes/Claude Code, never Groq.
// =============================================================================

const MODEL = 'llama-3.3-70b-versatile'
export type ReportPeriod = 'daily' | 'weekly' | 'monthly'

export function groqConfigured(): boolean {
  return Boolean(process.env['GROQ_API_KEY'])
}

function periodWindow(period: ReportPeriod): { sinceIso: string; label: string } {
  const now = new Date()
  const since = new Date(now)
  if (period === 'daily') since.setDate(now.getDate() - 1)
  else if (period === 'weekly') since.setDate(now.getDate() - 7)
  else since.setMonth(now.getMonth() - 1)
  const label =
    period === 'daily' ? 'Daily' : period === 'weekly' ? 'Weekly' : 'Monthly'
  return { sinceIso: since.toISOString(), label }
}

export interface ReportData {
  period: ReportPeriod
  sinceIso: string
  completedCount: number
  draftReadyCount: number
  activeCount: number
  overdueCount: number
  perBrand: { brand: string; completed: number; active: number; draftReady: number }[]
  completedTitles: { task: string; brand: string; by: string }[]
  // Progress comments logged on still-incomplete tasks within the window — so
  // management sees movement even when the status hasn't changed.
  progressNotes: { task: string; brand: string; by: string; status: string; note: string }[]
  // Today's daily-duty completion per person.
  dutiesToday: { person: string; done: number; total: number }[]
}

export async function gatherReportData(period: ReportPeriod): Promise<ReportData> {
  const supabase = db()
  const { sinceIso } = periodWindow(period)
  const today = new Date().toISOString().slice(0, 10)

  const [tasksRes, completionsRes, commentsRes, bmap] = await Promise.all([
    supabase.from('ops_tasks').select('*').limit(2000),
    supabase
      .from('ops_completion_records')
      .select('*')
      .gte('completion_date', sinceIso.slice(0, 10)),
    supabase
      .from('ops_task_comments')
      .select('*')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false }),
    brandMap(),
  ])
  const tasks = (tasksRes.data as OpsTaskRow[] | null) ?? []
  const completions = (completionsRes.data as OpsCompletionRecordRow[] | null) ?? []
  const comments = (commentsRes.data as OpsTaskCommentRow[] | null) ?? []

  const brandName = (id: string | null) =>
    (id && bmap.get(id)?.short_name) || (id && bmap.get(id)?.name) || 'Unassigned'

  const completedInWindow = tasks.filter(
    (t) => t.current_status === 'Completed' && t.updated_at >= sinceIso,
  )
  const draftReady = tasks.filter((t) => t.current_status === 'AI Draft Ready')
  const active = tasks.filter((t) => t.active === 'Yes' && t.current_status !== 'Completed')
  const overdue = active.filter((t) => t.target_date && t.target_date < today)

  const brands = [...new Set(tasks.map((t) => t.brand_id).filter(Boolean))] as string[]
  const perBrand = brands.map((b) => ({
    brand: brandName(b),
    completed: completedInWindow.filter((t) => t.brand_id === b).length,
    active: active.filter((t) => t.brand_id === b).length,
    draftReady: draftReady.filter((t) => t.brand_id === b).length,
  }))

  // Today's daily-duty completion per person.
  const [team, dutyProgress] = await Promise.all([listTeam(), dutyProgressByPerson()])
  const teamName = (id: string | null) => team.find((m) => m.id === id)?.name ?? 'Unassigned'
  const dutiesToday = dutyProgress
    .map((d) => ({ person: d.assignee_id ? teamName(d.assignee_id) : 'Unassigned', done: d.done, total: d.total }))
    .sort((a, b) => a.person.localeCompare(b.person))

  // Progress comments in the window on tasks that are NOT yet completed.
  const taskById = new Map(tasks.map((t) => [t.task_id, t]))
  const progressNotes = comments
    .map((c) => ({ c, t: taskById.get(c.task_id) }))
    .filter(({ t }) => t && t.current_status !== 'Completed')
    .slice(0, 40)
    .map(({ c, t }) => ({
      task: t!.task_name,
      brand: brandName(t!.brand_id),
      by: c.author || t!.assigned_to || '—',
      status: t!.current_status,
      note: c.body,
    }))

  return {
    period,
    sinceIso,
    completedCount: completedInWindow.length,
    draftReadyCount: draftReady.length,
    activeCount: active.length,
    overdueCount: overdue.length,
    perBrand,
    completedTitles: completedInWindow.slice(0, 40).map((t) => ({
      task: t.task_name,
      brand: brandName(t.brand_id),
      by: completions.find((c) => c.task_id === t.task_id)?.submitted_by || t.assigned_to || '—',
    })),
    progressNotes,
    dutiesToday,
  }
}

export async function narrateReport(data: ReportData): Promise<string> {
  if (!groqConfigured()) {
    return `(${data.period} report) ${data.completedCount} tasks completed, ${data.activeCount} active, ${data.draftReadyCount} AI drafts awaiting review, ${data.overdueCount} overdue, ${data.progressNotes.length} progress notes on ongoing work. Set GROQ_API_KEY for an AI narration.`
  }
  const groq = new Groq({ apiKey: process.env['GROQ_API_KEY']! })
  const system =
    'You are the Operations Analyst for One Core Group, a Kenyan multi-brand group. ' +
    'Write a concise, executive operations narration (4–8 sentences) on the team\'s delivery across the 6 brands. ' +
    'Lead with the headline, call out momentum and risks (overdue, drafts waiting for review), weave in notable progress notes on ongoing (not-yet-complete) work so leadership sees movement even where status is unchanged, and end with the focus for the next period. Clear Kenyan English. No invented facts.'
  const user = JSON.stringify(data, null, 2)
  const c = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0.5,
    max_tokens: 700,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `Operations data for the ${data.period} report:\n${user}` },
    ],
  })
  return c.choices[0]?.message?.content?.trim() ?? '(no narration produced)'
}

function buildHtml(data: ReportData, narrative: string): string {
  const GOLD = '#b07a00'
  const NAVY = '#1a1a2e'
  const rows = data.perBrand
    .map(
      (b) =>
        `<tr><td style="padding:6px 10px">${b.brand}</td><td style="padding:6px 10px;text-align:center">${b.completed}</td><td style="padding:6px 10px;text-align:center">${b.active}</td><td style="padding:6px 10px;text-align:center">${b.draftReady}</td></tr>`,
    )
    .join('')
  const label = data.period[0].toUpperCase() + data.period.slice(1)
  const esc = (s: string) => s.replace(/</g, '&lt;')
  const progressRows = data.progressNotes
    .map(
      (p) =>
        `<li style="margin-bottom:8px"><b>${esc(p.task)}</b> <span style="color:#888">· ${esc(p.brand)} · ${esc(p.status)} · ${esc(p.by)}</span><br><span style="color:#444">${esc(p.note)}</span></li>`,
    )
    .join('')
  const progressBlock = data.progressNotes.length
    ? `<div style="margin-top:18px">
        <p style="font-weight:700;font-size:13px;margin:0 0 8px">Progress on ongoing work (${data.progressNotes.length})</p>
        <p style="font-size:12px;color:#888;margin:0 0 8px">Updates logged today on tasks that are not yet complete.</p>
        <ul style="font-size:13px;line-height:1.5;padding-left:18px;margin:0">${progressRows}</ul>
      </div>`
    : ''
  const dutyRows = data.dutiesToday
    .map((d) => `<tr><td style="padding:6px 10px">${esc(d.person)}</td><td style="padding:6px 10px;text-align:center">${d.done}/${d.total}</td></tr>`)
    .join('')
  const dutiesBlock = data.dutiesToday.length
    ? `<div style="margin-top:18px">
        <p style="font-weight:700;font-size:13px;margin:0 0 8px">Daily duties — today</p>
        <table style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #eee">
          <thead><tr style="background:#faf8f3"><th style="padding:6px 10px;text-align:left">Team member</th><th style="padding:6px 10px">Done / total</th></tr></thead>
          <tbody>${dutyRows}</tbody>
        </table>
      </div>`
    : ''
  return `
  <div style="font-family:Inter,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1a1a2e">
    <div style="background:${NAVY};padding:18px 22px;border-radius:12px 12px 0 0">
      <span style="color:#fff;font-weight:700;font-size:18px">One Core Group</span>
      <span style="color:${GOLD};font-size:13px;margin-left:6px">Ops · ${label} report</span>
    </div>
    <div style="border:1px solid #eee;border-top:none;padding:22px;border-radius:0 0 12px 12px">
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
        <b>${data.completedCount}</b> completed · <b>${data.draftReadyCount}</b> drafts to review ·
        <b>${data.activeCount}</b> active · <b>${data.overdueCount}</b> overdue
      </div>
      <p style="font-size:14px;line-height:1.6;white-space:pre-wrap">${narrative.replace(/</g, '&lt;')}</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:16px;border:1px solid #eee">
        <thead><tr style="background:#faf8f3">
          <th style="padding:6px 10px;text-align:left">Brand</th>
          <th style="padding:6px 10px">Completed</th><th style="padding:6px 10px">Active</th><th style="padding:6px 10px">Drafts</th>
        </tr></thead><tbody>${rows}</tbody>
      </table>
      ${progressBlock}
      ${dutiesBlock}
    </div>
  </div>`
}

export async function generateAndSendReport(
  period: ReportPeriod,
): Promise<{ ok: boolean; sent: boolean; data: ReportData; note?: string }> {
  const data = await gatherReportData(period)
  const narrative = await narrateReport(data)
  const html = buildHtml(data, narrative)
  const label = period[0].toUpperCase() + period.slice(1)
  const subject = `OCG Ops — ${label} report · ${data.completedCount} completed, ${data.draftReadyCount} to review`

  const recipients = (process.env['OPS_REPORT_RECIPIENTS'] ?? process.env['OPS_EMAIL_FROM'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const sent = await sendReport(subject, html, recipients)

  await db()
    .from('ops_report_logs')
    .insert({
      report_type: period,
      subject,
      html,
      recipient: recipients.join(', '),
      triggered_by: 'cron',
    })

  return { ok: true, sent, data, note: sent ? undefined : 'Email not sent (RESEND_API_KEY/recipients missing) — report still logged.' }
}

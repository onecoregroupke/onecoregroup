// =============================================================================
// Marketing executive reports — aggregate activity + Groq narrative.
// =============================================================================
// One Core has no per-post metrics store, so reports summarise activity from
// the marketing tables themselves: content shipped/scheduled, content created
// by status, campaigns, and pillar mix. A Groq-written narrative is attached.

import { createServerClient } from '@ocg/db'
import type { MarketingExecutiveReportRow } from '@ocg/db'
import { groqComplete, isGroqConfigured } from './groq'
import { REPORT_STATUSES, type ExecutiveReport, type ReportStatus } from './types'

function toReport(row: MarketingExecutiveReportRow): ExecutiveReport {
  return {
    id: row.id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    subject: row.subject,
    preheader: row.preheader,
    bodyMarkdown: row.body_markdown ?? '',
    aiNarrative: row.ai_narrative,
    metricsJson: (row.metrics_json as Record<string, unknown>) ?? {},
    status: row.status as ReportStatus,
    scheduledFor: row.scheduled_for,
    sentAt: row.sent_at,
    sentCount: row.sent_count,
    failedCount: row.failed_count,
    recipients: row.recipients ?? [],
    createdByEmail: row.created_by_email,
    approvedByEmail: row.approved_by_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function isStatus(v: string): v is ReportStatus {
  return (REPORT_STATUSES as readonly string[]).includes(v)
}

// Allowed forward transitions for the report workflow.
const REPORT_TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  drafting: ['approved', 'cancelled'],
  approved: ['sending', 'drafting', 'cancelled'],
  sending: ['sent', 'cancelled'],
  sent: [],
  cancelled: [],
}

// ── Metrics aggregation ─────────────────────────────────────────────────

export interface ReportMetrics {
  periodStart: string
  periodEnd: string
  contentShipped: number
  contentScheduled: number
  contentCreated: number
  byStatus: Record<string, number>
  activeCampaigns: number
  campaignsStarted: number
  pillarMix: Array<{ name: string; count: number }>
}

async function gatherMetrics(periodStart: string, periodEnd: string): Promise<ReportMetrics> {
  const supabase = createServerClient()
  const startIso = new Date(`${periodStart}T00:00:00+03:00`).toISOString()
  const endIso = new Date(`${periodEnd}T23:59:59+03:00`).toISOString()

  const [shipped, scheduled, created, activeCamp, startedCamp, pillarLinks, pillars] =
    await Promise.all([
      supabase
        .from('marketing_content')
        .select('id', { count: 'exact', head: true })
        .in('status', ['published', 'reported'])
        .gte('published_at', startIso)
        .lte('published_at', endIso),
      supabase
        .from('marketing_content')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'scheduled')
        .gte('scheduled_at', startIso)
        .lte('scheduled_at', endIso),
      supabase
        .from('marketing_content')
        .select('id, status, created_at')
        .gte('created_at', startIso)
        .lte('created_at', endIso),
      supabase
        .from('marketing_campaigns')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'live'),
      supabase
        .from('marketing_campaigns')
        .select('id', { count: 'exact', head: true })
        .gte('start_date', periodStart)
        .lte('start_date', periodEnd),
      supabase.from('marketing_content_pillars').select('content_id, pillar_id'),
      supabase.from('marketing_pillars').select('id, name'),
    ])

  const createdRows = (created.data ?? []) as Array<{ id: string; status: string; created_at: string }>
  const byStatus: Record<string, number> = {}
  for (const r of createdRows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1

  // Pillar mix limited to content created in the window.
  const createdIds = new Set(createdRows.map((r) => r.id))
  const pillarName = new Map<string, string>(
    ((pillars.data ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]),
  )
  const pillarCount = new Map<string, number>()
  for (const link of (pillarLinks.data ?? []) as Array<{ content_id: string; pillar_id: string }>) {
    if (!createdIds.has(link.content_id)) continue
    const name = pillarName.get(link.pillar_id)
    if (!name) continue
    pillarCount.set(name, (pillarCount.get(name) ?? 0) + 1)
  }
  const pillarMix = [...pillarCount.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  return {
    periodStart,
    periodEnd,
    contentShipped: shipped.count ?? 0,
    contentScheduled: scheduled.count ?? 0,
    contentCreated: createdRows.length,
    byStatus,
    activeCampaigns: activeCamp.count ?? 0,
    campaignsStarted: startedCamp.count ?? 0,
    pillarMix,
  }
}

function metricsToMarkdown(m: ReportMetrics): string {
  const lines = [
    `## Marketing activity — ${m.periodStart} to ${m.periodEnd}`,
    '',
    `- **Posts shipped:** ${m.contentShipped}`,
    `- **Posts scheduled:** ${m.contentScheduled}`,
    `- **New content drafted:** ${m.contentCreated}`,
    `- **Active campaigns:** ${m.activeCampaigns}`,
    `- **Campaigns started this period:** ${m.campaignsStarted}`,
  ]
  if (m.pillarMix.length) {
    lines.push('', '### Pillar mix', ...m.pillarMix.map((p) => `- ${p.name}: ${p.count}`))
  }
  return lines.join('\n')
}

async function buildNarrative(m: ReportMetrics): Promise<string | null> {
  if (!isGroqConfigured()) return null
  const system =
    'You are a marketing operations analyst. Write a concise, plain-spoken executive summary ' +
    '(3 short paragraphs max) of the marketing activity for the period. Be specific about the ' +
    'numbers, note momentum or gaps, and end with one clear recommendation. No headings, no fluff.'
  const user = `Here is the period's marketing data as JSON:\n\n${JSON.stringify(m, null, 2)}`
  const result = await groqComplete(system, user, { maxTokens: 900, temperature: 0.5 })
  return result.ok ? result.text : null
}

// ── Reads ───────────────────────────────────────────────────────────────

export async function listReports(limit = 100): Promise<ExecutiveReport[]> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('marketing_executive_reports')
    .select('*')
    .order('period_end', { ascending: false })
    .limit(limit)
  if (error || !data) return []
  return (data as MarketingExecutiveReportRow[]).map(toReport)
}

export async function getReportById(id: string): Promise<ExecutiveReport | null> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('marketing_executive_reports')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  return toReport(data as MarketingExecutiveReportRow)
}

// ── Generate ──────────────────────────────────────────────────────────────

export async function generateReport(input: {
  periodStart: string
  periodEnd: string
  createdByEmail: string
}): Promise<{ ok: true; report: ExecutiveReport } | { ok: false; error: string }> {
  if (!input.periodStart || !input.periodEnd) {
    return { ok: false, error: 'Period start and end are required.' }
  }
  if (input.periodStart > input.periodEnd) {
    return { ok: false, error: 'Period start must be on or before period end.' }
  }
  const metrics = await gatherMetrics(input.periodStart, input.periodEnd)
  const narrative = await buildNarrative(metrics)
  const subject = `Marketing report · ${input.periodStart} → ${input.periodEnd}`
  const body = [metricsToMarkdown(metrics), '', narrative ? `## Summary\n\n${narrative}` : '']
    .join('\n')
    .trim()

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('marketing_executive_reports')
    .upsert(
      {
        period_start: input.periodStart,
        period_end: input.periodEnd,
        subject,
        body_markdown: body,
        ai_narrative: narrative,
        metrics_json: metrics as unknown as Record<string, unknown>,
        status: 'drafting',
        created_by_email: input.createdByEmail,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'period_start,period_end' },
    )
    .select('*')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? 'generate_failed' }
  return { ok: true, report: toReport(data as MarketingExecutiveReportRow) }
}

export async function regenerateNarrative(
  id: string,
): Promise<{ ok: true; report: ExecutiveReport } | { ok: false; error: string }> {
  const current = await getReportById(id)
  if (!current) return { ok: false, error: 'Report not found.' }
  const metrics = await gatherMetrics(current.periodStart, current.periodEnd)
  const narrative = await buildNarrative(metrics)
  if (!narrative) return { ok: false, error: 'Groq is not configured or returned no text.' }
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('marketing_executive_reports')
    .update({
      ai_narrative: narrative,
      metrics_json: metrics as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? 'regenerate_failed' }
  return { ok: true, report: toReport(data as MarketingExecutiveReportRow) }
}

export interface UpdateReportInput {
  subject?: string
  preheader?: string | null
  bodyMarkdown?: string
  recipients?: string[]
  scheduledFor?: string | null
}

export async function updateReport(
  id: string,
  input: UpdateReportInput,
): Promise<{ ok: true; report: ExecutiveReport } | { ok: false; error: string }> {
  const supabase = createServerClient()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.subject !== undefined) patch.subject = input.subject.trim()
  if (input.preheader !== undefined) patch.preheader = input.preheader?.trim() || null
  if (input.bodyMarkdown !== undefined) patch.body_markdown = input.bodyMarkdown
  if (input.recipients !== undefined) patch.recipients = input.recipients
  if (input.scheduledFor !== undefined) patch.scheduled_for = input.scheduledFor
  const { data, error } = await supabase
    .from('marketing_executive_reports')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? 'update_failed' }
  return { ok: true, report: toReport(data as MarketingExecutiveReportRow) }
}

export async function transitionReport(
  id: string,
  toStatus: string,
  byEmail: string,
): Promise<{ ok: true; report: ExecutiveReport } | { ok: false; error: string }> {
  if (!isStatus(toStatus)) return { ok: false, error: 'Unknown target status.' }
  const current = await getReportById(id)
  if (!current) return { ok: false, error: 'Report not found.' }
  if (!REPORT_TRANSITIONS[current.status].includes(toStatus)) {
    return { ok: false, error: `Cannot move "${current.status}" to "${toStatus}".` }
  }
  const patch: Record<string, unknown> = { status: toStatus, updated_at: new Date().toISOString() }
  if (toStatus === 'approved') patch.approved_by_email = byEmail
  // Email dispatch is deferred — moving to "sent" just stamps the send log.
  if (toStatus === 'sent') {
    patch.sent_at = new Date().toISOString()
    patch.sent_count = current.recipients.length
  }
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('marketing_executive_reports')
    .update(patch)
    .eq('id', id)
    .eq('status', current.status)
    .select('*')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? 'transition_failed' }
  return { ok: true, report: toReport(data as MarketingExecutiveReportRow) }
}

export { REPORT_TRANSITIONS }

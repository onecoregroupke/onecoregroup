import Groq from 'groq-sdk'
import { db, nowIso, todayInEat } from './serverClient'
import { gatherReportData, type ReportData } from './reporting'
import { sendReport } from './email'
import { brandMap } from './brands'
import type {
  FinanceTransactionRow,
  InventoryMovementRow,
  OcgDayCloseRow,
  OcgMeetingRow,
  FinanceExceptionRow,
  OcgBlockerRow,
} from '@ocg/db'

// =============================================================================
// Day close — the end-of-day ritual: the admin verifies the day's numbers,
// closes the day, and the system emails the master report covering every area
// of the business (tasks, finance, inventory, meetings, duties).
// =============================================================================

export interface DayCloseChecks {
  date: string
  alreadyClosed: OcgDayCloseRow | null
  tasksCompletedToday: number
  activeTasks: number
  overdueTasks: number
  financeTransactionsToday: number
  financeInToday: number
  financeOutToday: number
  inventoryMovementsToday: number
  meetingsHeldToday: number
  openExceptions: number
  openBlockers: number
  ops: ReportData
  financeByBrand: { brand: string; inflow: number; outflow: number; count: number }[]
  inventoryMoves: { item: string; direction: string; quantity: number; by: string }[]
}

export async function getDayCloseStatus(date = todayInEat()): Promise<DayCloseChecks> {
  const supabase = db()
  const [ops, bmap] = await Promise.all([gatherReportData('daily'), brandMap()])

  const [closeRes, txRes, invRes, meetingsRes, exceptionsRes, blockersRes] = await Promise.all([
    supabase.from('ocg_day_closes').select('*').eq('close_date', date).maybeSingle(),
    supabase.from('finance_transactions').select('*').eq('transaction_date', date),
    supabase.from('inventory_movements').select('*').eq('movement_date', date),
    supabase.from('ocg_meetings').select('*')
      .gte('meeting_date', `${date}T00:00:00Z`).lte('meeting_date', `${date}T23:59:59Z`),
    supabase.from('finance_exceptions').select('*').in('status', ['open', 'investigating']),
    supabase.from('ocg_blockers').select('*').eq('status', 'open'),
  ])

  const transactions = (txRes.data as FinanceTransactionRow[] | null) ?? []
  const movements = (invRes.data as InventoryMovementRow[] | null) ?? []
  const meetings = (meetingsRes.data as OcgMeetingRow[] | null) ?? []
  const exceptions = (exceptionsRes.data as FinanceExceptionRow[] | null) ?? []
  const blockers = (blockersRes.data as OcgBlockerRow[] | null) ?? []

  const brandName = (id: string | null) => (id && (bmap.get(id)?.short_name || bmap.get(id)?.name)) || 'Group'
  const financeBrands = [...new Set(transactions.map((t) => t.brand_id))]
  const financeByBrand = financeBrands.map((b) => {
    const rows = transactions.filter((t) => t.brand_id === b)
    return {
      brand: brandName(b),
      inflow: rows.filter((t) => t.direction === 'inflow' || t.direction === 'transfer_in').reduce((s, t) => s + Number(t.amount_ksh ?? 0), 0),
      outflow: rows.filter((t) => t.direction === 'outflow' || t.direction === 'transfer_out').reduce((s, t) => s + Number(t.amount_ksh ?? 0), 0),
      count: rows.length,
    }
  })

  // Item names for the inventory digest.
  const itemIds = [...new Set(movements.map((m) => m.item_id))]
  const itemName = new Map<string, string>()
  if (itemIds.length > 0) {
    const { data } = await supabase.from('inventory_items').select('id, name').in('id', itemIds)
    for (const row of (data as { id: string; name: string }[] | null) ?? []) itemName.set(row.id, row.name)
  }

  return {
    date,
    alreadyClosed: (closeRes.data as OcgDayCloseRow | null) ?? null,
    tasksCompletedToday: ops.completedCount,
    activeTasks: ops.activeCount,
    overdueTasks: ops.overdueCount,
    financeTransactionsToday: transactions.length,
    financeInToday: financeByBrand.reduce((s, b) => s + b.inflow, 0),
    financeOutToday: financeByBrand.reduce((s, b) => s + b.outflow, 0),
    inventoryMovementsToday: movements.length,
    meetingsHeldToday: meetings.filter((m) => m.status !== 'cancelled').length,
    openExceptions: exceptions.length,
    openBlockers: blockers.length,
    ops,
    financeByBrand,
    inventoryMoves: movements.slice(0, 20).map((m) => ({
      item: itemName.get(m.item_id) ?? 'Item',
      direction: m.direction,
      quantity: Number(m.quantity),
      by: m.recorded_by,
    })),
  }
}

async function narrateDayClose(checks: DayCloseChecks): Promise<string> {
  const fallback =
    `Day closed with ${checks.tasksCompletedToday} tasks completed, ` +
    `KSh ${checks.financeInToday.toLocaleString()} recorded in and KSh ${checks.financeOutToday.toLocaleString()} out ` +
    `across ${checks.financeTransactionsToday} transactions, ${checks.inventoryMovementsToday} inventory movements, ` +
    `and ${checks.meetingsHeldToday} meetings. ${checks.overdueTasks} tasks overdue, ` +
    `${checks.openExceptions} finance exceptions and ${checks.openBlockers} blockers still open.`
  if (!process.env['GROQ_API_KEY']) return fallback
  try {
    const groq = new Groq({ apiKey: process.env['GROQ_API_KEY']! })
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.4,
      max_tokens: 600,
      messages: [
        {
          role: 'system',
          content:
            'You are the Operations Analyst for One Core Group, a Kenyan multi-brand group. ' +
            'Write the end-of-day master report narration (5–9 sentences) for leadership: delivery across the 6 brands, ' +
            'money recorded in and out, stock movement, meetings held, and what carries into tomorrow (overdue work, exceptions, blockers). ' +
            'Lead with the headline. Clear Kenyan English. No invented facts.',
        },
        { role: 'user', content: JSON.stringify({ ...checks, ops: { ...checks.ops, progressNotes: checks.ops.progressNotes.slice(0, 15) } }) },
      ],
    })
    return completion.choices[0]?.message?.content?.trim() || fallback
  } catch {
    return fallback
  }
}

function dayCloseHtml(checks: DayCloseChecks, narrative: string, closedBy: string): string {
  const esc = (s: string) => s.replace(/</g, '&lt;')
  const financeRows = checks.financeByBrand
    .map((b) => `<tr><td style="padding:6px 10px">${esc(b.brand)}</td><td style="padding:6px 10px;text-align:right;color:#0a7d43">KSh ${b.inflow.toLocaleString()}</td><td style="padding:6px 10px;text-align:right;color:#b02020">KSh ${b.outflow.toLocaleString()}</td><td style="padding:6px 10px;text-align:center">${b.count}</td></tr>`)
    .join('')
  const brandRows = checks.ops.perBrand
    .map((b) => `<tr><td style="padding:6px 10px">${esc(b.brand)}</td><td style="padding:6px 10px;text-align:center">${b.completed}</td><td style="padding:6px 10px;text-align:center">${b.active}</td><td style="padding:6px 10px;text-align:center">${b.draftReady}</td></tr>`)
    .join('')
  const inventoryRows = checks.inventoryMoves
    .map((m) => `<li>${m.direction === 'in' ? '+' : '−'}${m.quantity.toLocaleString()} · ${esc(m.item)} <span style="color:#888">(${esc(m.by || '—')})</span></li>`)
    .join('')
  const dutyRows = checks.ops.dutiesToday
    .map((d) => `<tr><td style="padding:6px 10px">${esc(d.person)}</td><td style="padding:6px 10px;text-align:center">${d.done}/${d.total}</td></tr>`)
    .join('')

  const table = (head: string, body: string) => `
    <table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:8px;border:1px solid #eee">
      <thead><tr style="background:#faf8f3">${head}</tr></thead><tbody>${body}</tbody>
    </table>`

  return `
  <div style="font-family:Inter,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1a1a2e">
    <div style="background:#1a1a2e;padding:18px 22px;border-radius:12px 12px 0 0">
      <span style="color:#fff;font-weight:700;font-size:18px">One Core Group</span>
      <span style="color:#b07a00;font-size:13px;margin-left:6px">Master report · Day closed ${checks.date}</span>
    </div>
    <div style="border:1px solid #eee;border-top:none;padding:22px;border-radius:0 0 12px 12px">
      <p style="font-size:13px;color:#888;margin:0 0 12px">Verified and closed by ${esc(closedBy)}.</p>
      <div style="margin-bottom:14px;font-size:14px">
        <b>${checks.tasksCompletedToday}</b> tasks completed ·
        <b style="color:#0a7d43">KSh ${checks.financeInToday.toLocaleString()}</b> in ·
        <b style="color:#b02020">KSh ${checks.financeOutToday.toLocaleString()}</b> out ·
        <b>${checks.inventoryMovementsToday}</b> stock moves ·
        <b>${checks.meetingsHeldToday}</b> meetings
      </div>
      <p style="font-size:14px;line-height:1.6;white-space:pre-wrap">${esc(narrative)}</p>

      <p style="font-weight:700;font-size:13px;margin:18px 0 0">Delivery by brand</p>
      ${table('<th style="padding:6px 10px;text-align:left">Brand</th><th style="padding:6px 10px">Completed</th><th style="padding:6px 10px">Active</th><th style="padding:6px 10px">Drafts</th>', brandRows)}

      ${checks.financeByBrand.length ? `<p style="font-weight:700;font-size:13px;margin:18px 0 0">Money recorded today</p>
      ${table('<th style="padding:6px 10px;text-align:left">Brand</th><th style="padding:6px 10px;text-align:right">In</th><th style="padding:6px 10px;text-align:right">Out</th><th style="padding:6px 10px">Entries</th>', financeRows)}` : ''}

      ${checks.inventoryMoves.length ? `<p style="font-weight:700;font-size:13px;margin:18px 0 8px">Inventory movements</p>
      <ul style="font-size:13px;line-height:1.6;padding-left:18px;margin:0">${inventoryRows}</ul>` : ''}

      ${checks.ops.dutiesToday.length ? `<p style="font-weight:700;font-size:13px;margin:18px 0 0">Daily duties</p>
      ${table('<th style="padding:6px 10px;text-align:left">Team member</th><th style="padding:6px 10px">Done / total</th>', dutyRows)}` : ''}

      <p style="font-size:13px;color:#b02020;margin-top:18px">
        Carrying into tomorrow: ${checks.overdueTasks} overdue task${checks.overdueTasks === 1 ? '' : 's'},
        ${checks.openExceptions} finance exception${checks.openExceptions === 1 ? '' : 's'},
        ${checks.openBlockers} blocker${checks.openBlockers === 1 ? '' : 's'}.
      </p>
    </div>
  </div>`
}

/** Verify + close the day: snapshot the counters, narrate, email the master
 *  report, log it, and write the ocg_day_closes row. Idempotent per date. */
export async function closeDay(input: {
  closedBy: string
  notes?: string
  date?: string
}): Promise<{ close: OcgDayCloseRow; sent: boolean }> {
  const date = input.date ?? todayInEat()
  const checks = await getDayCloseStatus(date)
  if (checks.alreadyClosed) throw new Error(`The day ${date} is already closed.`)

  const narrative = await narrateDayClose(checks)
  const html = dayCloseHtml(checks, narrative, input.closedBy)
  const subject = `OCG Master Report · ${date} closed — ${checks.tasksCompletedToday} done, KSh ${checks.financeInToday.toLocaleString()} in / ${checks.financeOutToday.toLocaleString()} out`

  const recipients = (process.env['OPS_REPORT_RECIPIENTS'] ?? process.env['OPS_EMAIL_FROM'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const sent = await sendReport(subject, html, recipients)

  const supabase = db()
  await supabase.from('ops_report_logs').insert({
    report_type: 'day_close',
    subject,
    html,
    recipient: recipients.join(', '),
    triggered_by: input.closedBy,
  })

  const summary = {
    tasksCompletedToday: checks.tasksCompletedToday,
    activeTasks: checks.activeTasks,
    overdueTasks: checks.overdueTasks,
    financeTransactionsToday: checks.financeTransactionsToday,
    financeInToday: checks.financeInToday,
    financeOutToday: checks.financeOutToday,
    inventoryMovementsToday: checks.inventoryMovementsToday,
    meetingsHeldToday: checks.meetingsHeldToday,
    openExceptions: checks.openExceptions,
    openBlockers: checks.openBlockers,
  }
  const { data, error } = await supabase
    .from('ocg_day_closes')
    .insert({
      close_date: date,
      status: 'closed',
      closed_by: input.closedBy,
      summary,
      narrative,
      report_sent: sent,
      notes: input.notes ?? '',
      created_at: nowIso(),
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return { close: data as OcgDayCloseRow, sent }
}

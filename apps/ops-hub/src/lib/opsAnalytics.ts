import { db } from './serverClient'
import { listItems } from './inventory'
import { listRuns } from './manufacturing'
import { periodBalances, scopedBrandIds, type PeriodBalance } from './stockCards'
import { occurrencesOn } from './dutyOccurrences'
import type { DutyScope } from './dutyModel'
import type { OpsTaskRow, InventoryItemRow, ProductionRunRow } from '@ocg/db'

// =============================================================================
// OPERATIONAL ANALYTICS.
//
// Every figure here is computed from an operational table — the movement
// ledger, production runs, tasks, duty occurrences, attendance records. There
// are no seeded numbers and no placeholders: where there is no data, the metric
// reports zero and says so, rather than showing a plausible-looking figure.
//
// Anything that CANNOT yet be computed from real data is deliberately absent
// rather than stubbed. Sales analytics, for instance, needs the sales order
// book that does not exist yet (see docs/iceland-erp/01-MAPPING-REPORT.md §8).
// =============================================================================

export interface Window { from: string; to: string }

const round = (n: number, dp = 2) => Number(n.toFixed(dp))
const pct = (part: number, whole: number) => (whole > 0 ? round((part / whole) * 100, 1) : 0)

// ─── Manufacturing ──────────────────────────────────────────────────────────

export interface ManufacturingAnalytics {
  runs: number
  completedRuns: number
  activeRuns: number
  plannedQuantity: number
  producedQuantity: number
  rejectedQuantity: number
  wasteQuantity: number
  /** Rejected ÷ produced. The quality signal. */
  rejectRatePct: number
  /** Produced ÷ planned. Below 100 means runs under-deliver against plan. */
  planAttainmentPct: number
  rawConsumed: number
  packagingConsumed: number
  byProduct: Array<{ itemId: string; name: string; produced: number; rejected: number; rejectRatePct: number }>
  bottlenecks: Array<{ runRef: string; status: string; ageDays: number; product: string }>
}

export async function manufacturingAnalytics(
  allowed: string[] | null,
  win: Window,
  brandId?: string,
): Promise<ManufacturingAnalytics> {
  const [runs, items, balances] = await Promise.all([
    listRuns(allowed, { brandId, limit: 500 }),
    listItems(allowed, brandId),
    periodBalances({ allowed, brandId, from: win.from, to: win.to }),
  ])

  const inWindow = runs.filter((r) => {
    const d = (r.completed_at ?? r.created_at ?? '').slice(0, 10)
    return d >= win.from && d <= win.to
  })
  const itemById = new Map(items.map((i) => [i.id, i]))
  const sum = (rows: ProductionRunRow[], key: keyof ProductionRunRow) =>
    rows.reduce((acc, r) => acc + Number(r[key] ?? 0), 0)

  const produced = sum(inWindow, 'actual_quantity')
  const rejected = sum(inWindow, 'rejected_quantity')
  const planned = sum(inWindow, 'planned_quantity')

  // Consumption is read from the ledger, not from the runs, so it includes
  // every issue however it was raised.
  const consumedBy = (type: string) =>
    balances.filter((b) => itemById.get(b.item_id)?.item_type === type)
      .reduce((acc, b) => acc + b.quantity_out, 0)

  const byProductMap = new Map<string, { itemId: string; name: string; produced: number; rejected: number }>()
  for (const r of inWindow) {
    if (!r.product_item_id) continue
    const row = byProductMap.get(r.product_item_id) ?? {
      itemId: r.product_item_id,
      name: itemById.get(r.product_item_id)?.name ?? 'Unknown product',
      produced: 0, rejected: 0,
    }
    row.produced += Number(r.actual_quantity ?? 0)
    row.rejected += Number(r.rejected_quantity ?? 0)
    byProductMap.set(r.product_item_id, row)
  }

  // A bottleneck is a run that started and has not finished. Age is measured
  // from the run's own start, so a long-running batch stands out.
  const now = Date.now()
  const bottlenecks = runs
    .filter((r) => !['completed', 'closed', 'cancelled', 'rejected'].includes(r.status))
    .map((r) => ({
      runRef: r.run_ref,
      status: r.status,
      ageDays: Math.floor((now - Date.parse(r.started_at ?? r.created_at)) / 86_400_000),
      product: r.product_item_id ? (itemById.get(r.product_item_id)?.name ?? '') : '',
    }))
    .filter((b) => Number.isFinite(b.ageDays))
    .sort((a, b) => b.ageDays - a.ageDays)
    .slice(0, 10)

  return {
    runs: inWindow.length,
    completedRuns: inWindow.filter((r) => r.status === 'completed').length,
    activeRuns: runs.filter((r) => !['completed', 'closed', 'cancelled', 'rejected'].includes(r.status)).length,
    plannedQuantity: round(planned, 3),
    producedQuantity: round(produced, 3),
    rejectedQuantity: round(rejected, 3),
    wasteQuantity: round(sum(inWindow, 'waste_quantity'), 3),
    rejectRatePct: pct(rejected, produced + rejected),
    planAttainmentPct: pct(produced, planned),
    rawConsumed: round(consumedBy('raw_material'), 3),
    packagingConsumed: round(consumedBy('packaging'), 3),
    byProduct: [...byProductMap.values()]
      .map((p) => ({ ...p, rejectRatePct: pct(p.rejected, p.produced + p.rejected) }))
      .sort((a, b) => b.produced - a.produced)
      .slice(0, 10),
    bottlenecks,
  }
}

// ─── Inventory ──────────────────────────────────────────────────────────────

export interface InventoryAnalytics {
  itemCount: number
  totalValueKsh: number
  valueByType: Array<{ itemType: string; items: number; valueKsh: number }>
  stockOuts: Array<{ itemId: string; name: string; unit: string }>
  belowReorder: Array<{ itemId: string; name: string; onHand: number; threshold: number; unit: string }>
  /** No movement at all in the window, but stock on hand. */
  slowMoving: Array<{ itemId: string; name: string; onHand: number; valueKsh: number; lastMovement: string | null }>
  ledgerDrift: PeriodBalance[]
  totalIn: number
  totalOut: number
}

export async function inventoryAnalytics(
  allowed: string[] | null,
  win: Window,
  brandId?: string,
): Promise<InventoryAnalytics> {
  const [items, balances] = await Promise.all([
    listItems(allowed, brandId),
    periodBalances({ allowed, brandId, from: win.from, to: win.to }),
  ])
  const balanceById = new Map(balances.map((b) => [b.item_id, b]))

  const valueByTypeMap = new Map<string, { itemType: string; items: number; valueKsh: number }>()
  for (const i of items) {
    const type = i.item_type || 'consumable'
    const row = valueByTypeMap.get(type) ?? { itemType: type, items: 0, valueKsh: 0 }
    row.items += 1
    row.valueKsh += Number(i.quantity ?? 0) * Number(i.unit_value_ksh ?? 0)
    valueByTypeMap.set(type, row)
  }

  const threshold = (i: InventoryItemRow) => Number(i.minimum_stock || i.reorder_level || 0)

  return {
    itemCount: items.length,
    totalValueKsh: round(items.reduce((s, i) => s + Number(i.quantity ?? 0) * Number(i.unit_value_ksh ?? 0), 0)),
    valueByType: [...valueByTypeMap.values()]
      .map((r) => ({ ...r, valueKsh: round(r.valueKsh) }))
      .sort((a, b) => b.valueKsh - a.valueKsh),
    stockOuts: items.filter((i) => Number(i.quantity ?? 0) <= 0)
      .map((i) => ({ itemId: i.id, name: i.name, unit: i.unit })),
    belowReorder: items
      .filter((i) => threshold(i) > 0 && Number(i.quantity ?? 0) > 0 && Number(i.quantity ?? 0) <= threshold(i))
      .map((i) => ({ itemId: i.id, name: i.name, onHand: Number(i.quantity ?? 0), threshold: threshold(i), unit: i.unit }))
      .sort((a, b) => a.onHand / (a.threshold || 1) - b.onHand / (b.threshold || 1)),
    slowMoving: items
      .filter((i) => Number(i.quantity ?? 0) > 0 && (balanceById.get(i.id)?.movements ?? 0) === 0)
      .map((i) => ({
        itemId: i.id,
        name: i.name,
        onHand: Number(i.quantity ?? 0),
        valueKsh: round(Number(i.quantity ?? 0) * Number(i.unit_value_ksh ?? 0)),
        lastMovement: balanceById.get(i.id)?.last_movement ?? null,
      }))
      .sort((a, b) => b.valueKsh - a.valueKsh)
      .slice(0, 15),
    // Where the replayed ledger and the item's stored quantity disagree.
    ledgerDrift: balances.filter((b) => Math.abs(b.drift) > 0.001),
    totalIn: round(balances.reduce((s, b) => s + b.quantity_in, 0), 3),
    totalOut: round(balances.reduce((s, b) => s + b.quantity_out, 0), 3),
  }
}

// ─── Tasks ──────────────────────────────────────────────────────────────────

export interface TaskAnalytics {
  total: number
  completed: number
  completionRatePct: number
  overdue: number
  awaitingReview: number
  blocked: number
  byPerson: Array<{ name: string; total: number; completed: number; overdue: number; completionRatePct: number }>
  byStatus: Array<{ status: string; count: number }>
}

const DONE_STATUSES = new Set(['Completed', 'Approved'])
const OPEN_STATUSES = new Set(['Not Started', 'Ongoing', 'AI Draft Ready', 'Edit Requested', 'Reopened', 'Blocked'])

export async function taskAnalytics(
  allowed: string[] | null,
  win: Window,
  brandId?: string,
  today = win.to,
): Promise<TaskAnalytics> {
  const brands = scopedBrandIds(allowed, brandId)
  let q = db().from('ops_tasks').select('*')
    .gte('target_date', win.from).lte('target_date', win.to).limit(5000)
  if (brands !== null) q = q.in('brand_id', brands)
  const { data } = await q
  const tasks = (data as OpsTaskRow[] | null) ?? []

  const isOverdue = (t: OpsTaskRow) =>
    OPEN_STATUSES.has(t.current_status) && !!t.target_date && t.target_date < today

  const byPersonMap = new Map<string, { name: string; total: number; completed: number; overdue: number }>()
  const byStatusMap = new Map<string, number>()
  for (const t of tasks) {
    const name = t.assigned_to || 'Unassigned'
    const row = byPersonMap.get(name) ?? { name, total: 0, completed: 0, overdue: 0 }
    row.total += 1
    if (DONE_STATUSES.has(t.current_status)) row.completed += 1
    if (isOverdue(t)) row.overdue += 1
    byPersonMap.set(name, row)
    byStatusMap.set(t.current_status, (byStatusMap.get(t.current_status) ?? 0) + 1)
  }

  const completed = tasks.filter((t) => DONE_STATUSES.has(t.current_status)).length

  return {
    total: tasks.length,
    completed,
    completionRatePct: pct(completed, tasks.length),
    overdue: tasks.filter(isOverdue).length,
    awaitingReview: tasks.filter((t) => t.current_status === 'Submitted' || t.current_status === 'Under Review').length,
    blocked: tasks.filter((t) => t.current_status === 'Blocked').length,
    byPerson: [...byPersonMap.values()]
      .map((p) => ({ ...p, completionRatePct: pct(p.completed, p.total) }))
      .sort((a, b) => b.total - a.total),
    byStatus: [...byStatusMap.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
  }
}

// ─── Duties ─────────────────────────────────────────────────────────────────

export interface DutyAnalytics {
  occurrences: number
  done: number
  skipped: number
  pending: number
  overdue: number
  completionRatePct: number
  onTimeRatePct: number
  awaitingReview: number
  byPerson: Array<{ name: string; total: number; done: number; completionRatePct: number }>
}

/**
 * Duty completion across a window. Occurrences are DERIVED per day, so this
 * walks the window day by day rather than reading a table of pre-generated
 * rows — the same records the assignee sees, counted.
 *
 * Bounded to 62 days so a wide filter cannot walk the whole history.
 */
export async function dutyAnalytics(scope: DutyScope, win: Window): Promise<DutyAnalytics> {
  const days: string[] = []
  const cur = new Date(`${win.from}T00:00:00Z`)
  const end = new Date(`${win.to}T00:00:00Z`).getTime()
  while (cur.getTime() <= end && days.length < 62) {
    days.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }

  const all = (await Promise.all(days.map((d) => occurrencesOn(d, { scope })))).flat()

  const byPersonMap = new Map<string, { name: string; total: number; done: number }>()
  for (const o of all) {
    const name = o.assignee.name || 'Unassigned'
    const row = byPersonMap.get(name) ?? { name, total: 0, done: 0 }
    row.total += 1
    if (o.status === 'done') row.done += 1
    byPersonMap.set(name, row)
  }

  const done = all.filter((o) => o.status === 'done')
  const onTime = done.filter((o) => o.onTime === true).length
  const rated = done.filter((o) => o.onTime !== null).length

  return {
    occurrences: all.length,
    done: done.length,
    skipped: all.filter((o) => o.status === 'skipped').length,
    pending: all.filter((o) => o.status === 'pending').length,
    overdue: all.filter((o) => o.overdue).length,
    completionRatePct: pct(done.length, all.length),
    onTimeRatePct: pct(onTime, rated),
    awaitingReview: all.filter((o) => o.reviewState === 'pending').length,
    byPerson: [...byPersonMap.values()]
      .map((p) => ({ ...p, completionRatePct: pct(p.done, p.total) }))
      .sort((a, b) => b.total - a.total),
  }
}

// ─── Attendance ─────────────────────────────────────────────────────────────

export interface AttendanceAnalytics {
  records: number
  people: number
  daysCovered: number
  withCheckIn: number
  missingCheckOut: number
  averageHours: number | null
  byPerson: Array<{ name: string; days: number; averageHours: number | null; missingCheckOut: number }>
}

export async function attendanceAnalytics(win: Window): Promise<AttendanceAnalytics> {
  const { data } = await db().from('ops_attendance_records').select('*')
    .gte('attendance_date', win.from).lte('attendance_date', win.to).limit(5000)
  const rows = (data as Array<{
    employee_name: string; employee_email: string; attendance_date: string
    check_in_at: string | null; check_out_at: string | null
  }> | null) ?? []

  const hoursOf = (r: { check_in_at: string | null; check_out_at: string | null }) => {
    if (!r.check_in_at || !r.check_out_at) return null
    const h = (Date.parse(r.check_out_at) - Date.parse(r.check_in_at)) / 3_600_000
    return Number.isFinite(h) && h >= 0 ? h : null
  }

  const byPersonMap = new Map<string, { name: string; days: number; hours: number[]; missingCheckOut: number }>()
  for (const r of rows) {
    const name = r.employee_name || r.employee_email || 'Unknown'
    const row = byPersonMap.get(name) ?? { name, days: 0, hours: [], missingCheckOut: 0 }
    row.days += 1
    const h = hoursOf(r)
    if (h !== null) row.hours.push(h)
    if (r.check_in_at && !r.check_out_at) row.missingCheckOut += 1
    byPersonMap.set(name, row)
  }

  const allHours = rows.map(hoursOf).filter((h): h is number => h !== null)
  const mean = (xs: number[]) => (xs.length > 0 ? round(xs.reduce((a, b) => a + b, 0) / xs.length, 1) : null)

  return {
    records: rows.length,
    people: byPersonMap.size,
    daysCovered: new Set(rows.map((r) => r.attendance_date)).size,
    withCheckIn: rows.filter((r) => !!r.check_in_at).length,
    missingCheckOut: rows.filter((r) => r.check_in_at && !r.check_out_at).length,
    averageHours: mean(allHours),
    byPerson: [...byPersonMap.values()]
      .map((p) => ({ name: p.name, days: p.days, averageHours: mean(p.hours), missingCheckOut: p.missingCheckOut }))
      .sort((a, b) => b.days - a.days),
  }
}

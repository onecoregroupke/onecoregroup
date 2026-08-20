import { db, nowIso, todayInEat } from './serverClient'
import { listTeam } from './team'
import {
  resolveDutyAssignees, isDutyActiveOn, validateDutyCompletion, initialReviewState,
  wasCompletedOnTime, dutyDueAt, isOccurrenceOverdue,
  type TargetableMember, type DutyScope,
} from './dutyModel'
import type {
  OcgDailyDutyRow, OcgDailyDutyLogRow, OcgDutyChecklistItemRow,
  OcgDutyChecklistResultRow, OcgHolidayRow,
} from '@ocg/db'

// =============================================================================
// Duty occurrences (§2). An occurrence is DERIVED — (duty × due date × targeted
// person) — and its result is the single ocg_daily_duty_logs row keyed by
// exactly that triple (migration 055 §7). Nothing here ever "generates" the next
// day's rows, so yesterday's result cannot be overwritten and the same
// occurrence cannot exist twice however many surfaces display it.
// =============================================================================

export interface DutyOccurrence {
  duty: OcgDailyDutyRow
  date: string
  assignee: { id: string | null; name: string; email: string }
  dueAt: string | null
  log: OcgDailyDutyLogRow | null
  status: string           // done | skipped | pending (pending = no log yet)
  overdue: boolean
  onTime: boolean | null
  checklistDone: number
  checklistTotal: number
  reviewState: string
}

async function loadHolidays(): Promise<OcgHolidayRow[]> {
  const { data } = await db().from('ocg_holidays').select('*')
  return (data as OcgHolidayRow[] | null) ?? []
}

async function loadChecklistCounts(dutyIds: string[]): Promise<Map<string, number>> {
  if (dutyIds.length === 0) return new Map()
  const { data } = await db()
    .from('ocg_duty_checklist_items')
    .select('duty_id')
    .in('duty_id', dutyIds)
    .eq('active', true)
  const counts = new Map<string, number>()
  for (const row of (data as { duty_id: string }[] | null) ?? []) {
    counts.set(row.duty_id, (counts.get(row.duty_id) ?? 0) + 1)
  }
  return counts
}

function scopeFilter(scope: DutyScope, duty: OcgDailyDutyRow, memberId: string | null): boolean {
  switch (scope.kind) {
    case 'all': return true
    case 'brands': return !!duty.brand_id && scope.brandIds.includes(duty.brand_id)
    case 'own': return memberId != null && duty.assignee_id === memberId
  }
}

/**
 * Every duty occurrence on `date`, expanded across each duty's targeted people
 * and joined to its result row. This is the one function the task list, My
 * Tasks, Today, the calendar, the morning brief and the manager report all read
 * from — so a single occurrence can be displayed in six places without ever
 * becoming six records.
 */
export async function occurrencesOn(
  date = todayInEat(),
  opts: { scope?: DutyScope; teamMemberId?: string | null } = {},
): Promise<DutyOccurrence[]> {
  const supabase = db()
  const scope = opts.scope ?? { kind: 'all' as const }

  const [{ data: dutyRows }, team, holidays] = await Promise.all([
    supabase.from('ocg_daily_duties').select('*').eq('active', true),
    listTeam(),
    loadHolidays(),
  ])
  const duties = (dutyRows as OcgDailyDutyRow[] | null) ?? []
  const members = team as unknown as TargetableMember[]

  const dueDuties = duties.filter((d) => isDutyActiveOn(d, date, holidays))
  if (dueDuties.length === 0) return []

  const [{ data: logRows }, checklistTotals] = await Promise.all([
    supabase.from('ocg_daily_duty_logs').select('*').eq('duty_date', date)
      .in('duty_id', dueDuties.map((d) => d.id)),
    loadChecklistCounts(dueDuties.map((d) => d.id)),
  ])
  const logs = (logRows as OcgDailyDutyLogRow[] | null) ?? []
  const logByKey = new Map(logs.map((l) => [`${l.duty_id}:${l.assignee_id ?? ''}`, l]))

  const now = nowIso()
  const out: DutyOccurrence[] = []

  for (const duty of dueDuties) {
    const targeted = resolveDutyAssignees(duty, members)
    // A duty that resolves to nobody still surfaces once, unassigned, so a
    // mis-targeted duty is visible to managers instead of silently vanishing.
    const people: Array<TargetableMember | null> = targeted.length > 0 ? targeted : [null]

    for (const person of people) {
      const memberId = person?.id ?? duty.assignee_id ?? null
      if (!scopeFilter(scope, duty, memberId)) continue
      if (scope.kind === 'own' && opts.teamMemberId && memberId !== opts.teamMemberId) continue

      const log = logByKey.get(`${duty.id}:${memberId ?? ''}`) ?? null
      const dueAt = duty.time_of_day ? dutyDueAt(date, duty.time_of_day, duty.timezone) : null
      const status = log?.status ?? 'pending'

      out.push({
        duty,
        date,
        assignee: {
          id: memberId,
          name: person?.name ?? '',
          email: person?.email ?? '',
        },
        dueAt,
        log,
        status,
        overdue: isOccurrenceOverdue(dueAt, status, now, duty.grace_minutes),
        onTime: log?.completed_on_time ?? null,
        checklistDone: log?.checklist_done ?? 0,
        checklistTotal: checklistTotals.get(duty.id) ?? 0,
        reviewState: log?.review_state ?? 'not_required',
      })
    }
  }
  return out
}

/** Occurrences for one person on one date — the My Tasks / morning brief feed. */
export async function occurrencesForMember(
  teamMemberId: string,
  date = todayInEat(),
): Promise<DutyOccurrence[]> {
  const all = await occurrencesOn(date, { scope: { kind: 'all' } })
  return all.filter((o) => o.assignee.id === teamMemberId)
}

/**
 * Uncompleted occurrences from the days BEFORE `date` (§4 "Overdue duties").
 * Bounded by `lookbackDays` so the brief never walks the whole history.
 */
export async function overdueOccurrences(
  opts: { scope?: DutyScope; teamMemberId?: string | null; date?: string; lookbackDays?: number } = {},
): Promise<DutyOccurrence[]> {
  const date = opts.date ?? todayInEat()
  const lookback = Math.max(1, Math.min(opts.lookbackDays ?? 7, 60))
  const out: DutyOccurrence[] = []
  for (let i = 1; i <= lookback; i++) {
    const d = new Date(`${date}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - i)
    const iso = d.toISOString().slice(0, 10)
    const day = await occurrencesOn(iso, opts)
    out.push(...day.filter((o) => o.status === 'pending'))
  }
  return out
}

// ─── Checklists ─────────────────────────────────────────────────────────────

export async function listChecklistItems(dutyId: string): Promise<OcgDutyChecklistItemRow[]> {
  const { data } = await db()
    .from('ocg_duty_checklist_items')
    .select('*')
    .eq('duty_id', dutyId)
    .eq('active', true)
    .order('position', { ascending: true })
  return (data as OcgDutyChecklistItemRow[] | null) ?? []
}

export async function setChecklistItems(
  dutyId: string,
  items: Array<{ id?: string; label: string; hint?: string; required?: boolean }>,
): Promise<OcgDutyChecklistItemRow[]> {
  const supabase = db()
  const existing = await listChecklistItems(dutyId)
  const keep = new Set(items.map((i) => i.id).filter(Boolean) as string[])

  // Items dropped from the definition are deactivated, never deleted — past
  // occurrences still reference their results.
  const retire = existing.filter((e) => !keep.has(e.id)).map((e) => e.id)
  if (retire.length > 0) {
    await supabase.from('ocg_duty_checklist_items')
      .update({ active: false, updated_at: nowIso() }).in('id', retire)
  }

  for (const [position, item] of items.entries()) {
    if (item.id) {
      await supabase.from('ocg_duty_checklist_items').update({
        label: item.label, hint: item.hint ?? '', required: item.required ?? true,
        position, active: true, updated_at: nowIso(),
      }).eq('id', item.id)
    } else {
      await supabase.from('ocg_duty_checklist_items').insert({
        duty_id: dutyId, label: item.label, hint: item.hint ?? '',
        required: item.required ?? true, position,
      })
    }
  }
  return listChecklistItems(dutyId)
}

export async function listChecklistResults(logId: string): Promise<OcgDutyChecklistResultRow[]> {
  const { data } = await db().from('ocg_duty_checklist_results').select('*').eq('log_id', logId)
  return (data as OcgDutyChecklistResultRow[] | null) ?? []
}

// ─── Completion (§12) ───────────────────────────────────────────────────────

export class DutyCompletionError extends Error {
  constructor(public problems: string[]) {
    super(problems.join(' '))
    this.name = 'DutyCompletionError'
  }
}

export interface CompleteDutyInput {
  duty_id: string
  assignee_id: string | null
  date?: string
  status: string                 // done | skipped | pending
  note?: string
  completed_by: string
  attachment_count?: number
  form_submission_id?: string | null
  /** item_id → { checked, note } */
  checklist?: Record<string, { checked: boolean; note?: string }>
}

/**
 * Record a duty occurrence result, refusing completions that do not satisfy the
 * template's requirements. Upserts on (duty_id, duty_date, assignee) so a
 * re-submission corrects the existing occurrence instead of creating a second.
 */
export async function completeDutyOccurrence(input: CompleteDutyInput): Promise<OcgDailyDutyLogRow> {
  const supabase = db()
  const date = input.date ?? todayInEat()

  const { data: dutyRow } = await supabase
    .from('ocg_daily_duties').select('*').eq('id', input.duty_id).maybeSingle()
  if (!dutyRow) throw new Error('Duty not found')
  const duty = dutyRow as OcgDailyDutyRow

  const items = await listChecklistItems(duty.id)
  const checklistTotal = items.length
  const checklistDone = items.filter((i) => input.checklist?.[i.id]?.checked).length

  const problems = validateDutyCompletion(duty, {
    status: input.status,
    note: input.note,
    attachment_count: input.attachment_count,
    checklist_done: checklistDone,
    checklist_total: checklistTotal,
    form_submission_id: input.form_submission_id,
  })
  if (problems.length > 0) throw new DutyCompletionError(problems)

  const completedAt = nowIso()
  const dueAt = duty.time_of_day ? dutyDueAt(date, duty.time_of_day, duty.timezone) : null

  const payload = {
    duty_id: duty.id,
    assignee_id: input.assignee_id,
    duty_date: date,
    status: input.status,
    note: input.note ?? '',
    completed_at: completedAt,
    completed_by: input.completed_by,
    due_at: dueAt,
    completed_on_time: input.status === 'done'
      ? wasCompletedOnTime(dueAt, completedAt, duty.grace_minutes)
      : null,
    checklist_done: checklistDone,
    checklist_total: checklistTotal,
    review_state: initialReviewState(duty, input.status),
    form_submission_id: input.form_submission_id ?? null,
    attachment_count: input.attachment_count ?? 0,
  }

  const existingQuery = supabase
    .from('ocg_daily_duty_logs').select('id')
    .eq('duty_id', duty.id).eq('duty_date', date)
  const scopedExistingQuery = input.assignee_id
    ? existingQuery.eq('assignee_id', input.assignee_id)
    : existingQuery.is('assignee_id', null)
  const { data: existingRow } = await scopedExistingQuery.maybeSingle()

  let log: OcgDailyDutyLogRow
  if (existingRow) {
    const { data, error } = await supabase.from('ocg_daily_duty_logs')
      .update(payload).eq('id', (existingRow as { id: string }).id).select('*').single()
    if (error) throw new Error(error.message)
    log = data as OcgDailyDutyLogRow
  } else {
    const { data, error } = await supabase.from('ocg_daily_duty_logs')
      .insert(payload).select('*').single()
    if (error) throw new Error(error.message)
    log = data as OcgDailyDutyLogRow
  }

  if (input.checklist && items.length > 0) {
    for (const item of items) {
      const result = input.checklist[item.id]
      if (!result) continue
      await supabase.from('ocg_duty_checklist_results').upsert({
        log_id: log.id, item_id: item.id,
        checked: result.checked, note: result.note ?? '',
        checked_by: input.completed_by, checked_at: completedAt, updated_at: completedAt,
      }, { onConflict: 'log_id,item_id' })
    }
  }
  return log
}

/** Assign a substitute to one occurrence without changing the duty template or
 * replacing the original owner. This is the audit-safe cover operation. */
export async function coverDutyOccurrence(input: {
  duty_id: string
  duty_date: string
  original_assignee_id: string
  substitute_assignee_id: string
  reason: string
  changed_by: string
}): Promise<OcgDailyDutyLogRow> {
  if (!input.reason.trim()) throw new Error('A cover reason is required')
  if (input.original_assignee_id === input.substitute_assignee_id) {
    throw new Error('The substitute must be a different person')
  }
  const supabase = db()
  const { data: duty } = await supabase.from('ocg_daily_duties').select('*').eq('id', input.duty_id).maybeSingle()
  if (!duty) throw new Error('Duty not found')

  const { data: existing } = await supabase.from('ocg_daily_duty_logs').select('*')
    .eq('duty_id', input.duty_id).eq('duty_date', input.duty_date)
    .eq('assignee_id', input.original_assignee_id).maybeSingle()
  const patch = {
    original_assignee_id: input.original_assignee_id,
    substitute_assignee_id: input.substitute_assignee_id,
    reassignment_reason: input.reason.trim(),
  }
  let log: OcgDailyDutyLogRow
  if (existing) {
    const { data, error } = await supabase.from('ocg_daily_duty_logs').update(patch)
      .eq('id', (existing as OcgDailyDutyLogRow).id).select('*').single()
    if (error) throw new Error(error.message)
    log = data as OcgDailyDutyLogRow
  } else {
    const row = duty as OcgDailyDutyRow
    const { data, error } = await supabase.from('ocg_daily_duty_logs').insert({
      duty_id: input.duty_id,
      assignee_id: input.original_assignee_id,
      duty_date: input.duty_date,
      status: 'pending',
      note: '',
      completed_at: nowIso(),
      due_at: row.time_of_day ? dutyDueAt(input.duty_date, row.time_of_day, row.timezone) : null,
      ...patch,
    }).select('*').single()
    if (error) throw new Error(error.message)
    log = data as OcgDailyDutyLogRow
  }

  await supabase.from('ocg_duty_assignment_events').insert({
    duty_id: input.duty_id,
    duty_log_id: log.id,
    duty_date: input.duty_date,
    original_assignee_id: input.original_assignee_id,
    substitute_assignee_id: input.substitute_assignee_id,
    reason: input.reason.trim(),
    event_type: 'cover',
    changed_by: input.changed_by,
  })
  return log
}

// ─── Manager review (§13) ───────────────────────────────────────────────────

export async function reviewDutyOccurrence(input: {
  log_id: string
  decision: 'accept' | 'reopen'
  comment?: string
  quality_rating?: number | null
  reviewed_by: string
}): Promise<OcgDailyDutyLogRow> {
  const { data, error } = await db().from('ocg_daily_duty_logs').update({
    review_state: input.decision === 'accept' ? 'accepted' : 'reopened',
    // Reopening returns the occurrence to the assignee's list; accepting leaves
    // the recorded completion untouched.
    status: input.decision === 'reopen' ? 'pending' : undefined,
    review_comment: input.comment ?? '',
    quality_rating: input.quality_rating ?? null,
    reviewed_by: input.reviewed_by,
    reviewed_at: nowIso(),
  }).eq('id', input.log_id).select('*').single()
  if (error) throw new Error(error.message)
  return data as OcgDailyDutyLogRow
}

/** Occurrences awaiting a manager decision. */
export async function pendingReviews(scope: DutyScope): Promise<OcgDailyDutyLogRow[]> {
  if (scope.kind === 'own') return []
  const { data } = await db().from('ocg_daily_duty_logs').select('*')
    .eq('review_state', 'pending').order('duty_date', { ascending: false }).limit(200)
  const logs = (data as OcgDailyDutyLogRow[] | null) ?? []
  if (scope.kind === 'all') return logs

  const { data: duties } = await db().from('ocg_daily_duties')
    .select('id, brand_id').in('id', logs.map((l) => l.duty_id))
  const inScope = new Set(
    ((duties as { id: string; brand_id: string | null }[] | null) ?? [])
      .filter((d) => d.brand_id && scope.brandIds.includes(d.brand_id))
      .map((d) => d.id),
  )
  return logs.filter((l) => inScope.has(l.duty_id))
}

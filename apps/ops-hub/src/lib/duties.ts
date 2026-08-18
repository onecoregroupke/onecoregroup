import { db, nowIso, todayInEat } from './serverClient'
import { isDutyDueOn } from './recurrence'
import type { OcgDailyDutyRow, OcgDailyDutyLogRow } from '@ocg/db'

export async function listDuties(opts: { activeOnly?: boolean } = {}): Promise<OcgDailyDutyRow[]> {
  let q = db().from('ocg_daily_duties').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true })
  if (opts.activeOnly) q = q.eq('active', true)
  const { data } = await q
  return (data as OcgDailyDutyRow[] | null) ?? []
}

export async function listDutiesForAssignee(assigneeId: string): Promise<OcgDailyDutyRow[]> {
  const { data } = await db()
    .from('ocg_daily_duties')
    .select('*')
    .eq('assignee_id', assigneeId)
    .eq('active', true)
    .order('sort_order', { ascending: true })
  return (data as OcgDailyDutyRow[] | null) ?? []
}

export async function listDutyLogsForDate(date = todayInEat()): Promise<OcgDailyDutyLogRow[]> {
  const { data } = await db().from('ocg_daily_duty_logs').select('*').eq('duty_date', date)
  return (data as OcgDailyDutyLogRow[] | null) ?? []
}

export interface CreateDutyInput {
  assignee_id?: string | null
  brand_id?: string | null
  title: string
  description?: string
  department?: string
  sort_order?: number
  frequency?: string
  weekdays?: number[]
  day_of_month?: number | null
  interval_days?: number
  time_of_day?: string
  timezone?: string
  start_date?: string | null
  end_date?: string | null
  priority?: string
  category?: string
  requires_proof?: boolean
  reminder_minutes?: number
  // ─── Migration 055: configurable targeting, requirements and review ───────
  /** employee | team | department | brand | location | role */
  target_kind?: string
  target_team?: string
  target_department?: string
  target_role?: string
  target_location?: string
  /** task | checklist | report | form | inspection */
  duty_kind?: string
  instructions?: string
  location?: string
  reviewer_id?: string | null
  requires_note?: boolean
  requires_checklist?: boolean
  requires_approval?: boolean
  required_form_template_id?: string | null
  grace_minutes?: number
  escalation_minutes?: number
  skip_holidays?: boolean
  created_by?: string
}

export async function createDuty(input: CreateDutyInput): Promise<OcgDailyDutyRow> {
  if (!input.title.trim()) throw new Error('Duty title is required')
  const { data, error } = await db()
    .from('ocg_daily_duties')
    .insert({
      assignee_id: input.assignee_id || null,
      brand_id: input.brand_id || null,
      title: input.title.trim(),
      description: input.description ?? '',
      department: input.department ?? 'Operations',
      sort_order: input.sort_order ?? 0,
      active: true,
      frequency: input.frequency ?? 'daily',
      weekdays: input.weekdays ?? [],
      day_of_month: input.day_of_month ?? null,
      interval_days: input.interval_days ?? 0,
      time_of_day: input.time_of_day ?? '',
      timezone: input.timezone ?? 'Africa/Nairobi',
      start_date: input.start_date ?? null,
      end_date: input.end_date ?? null,
      priority: input.priority ?? 'Medium',
      category: input.category ?? '',
      requires_proof: input.requires_proof ?? false,
      reminder_minutes: input.reminder_minutes ?? 0,
      // 055 configuration. Targeting defaults to 'employee' so an existing
      // caller that sends only assignee_id keeps its old behaviour exactly.
      target_kind: input.target_kind ?? 'employee',
      target_team: input.target_team ?? '',
      target_department: input.target_department ?? '',
      target_role: input.target_role ?? '',
      target_location: input.target_location ?? '',
      duty_kind: input.duty_kind ?? 'task',
      instructions: input.instructions ?? '',
      location: input.location ?? '',
      reviewer_id: input.reviewer_id || null,
      requires_note: input.requires_note ?? false,
      requires_checklist: input.requires_checklist ?? false,
      requires_approval: input.requires_approval ?? false,
      required_form_template_id: input.required_form_template_id || null,
      grace_minutes: input.grace_minutes ?? 0,
      escalation_minutes: input.escalation_minutes ?? 0,
      skip_holidays: input.skip_holidays ?? false,
      created_by: input.created_by ?? '',
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as OcgDailyDutyRow
}

/** Active duties whose recurrence makes them DUE on `date` (default: today EAT). */
export async function listDueDuties(date = todayInEat()): Promise<OcgDailyDutyRow[]> {
  const duties = await listDuties({ activeOnly: true })
  return duties.filter((d) => isDutyDueOn(d, date))
}

export async function listDueDutiesForAssignee(assigneeId: string, date = todayInEat()): Promise<OcgDailyDutyRow[]> {
  const duties = await listDutiesForAssignee(assigneeId)
  return duties.filter((d) => isDutyDueOn(d, date))
}

export async function updateDuty(id: string, fields: Partial<OcgDailyDutyRow>): Promise<OcgDailyDutyRow> {
  const { data, error } = await db()
    .from('ocg_daily_duties')
    .update({ ...fields, updated_at: nowIso() })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as OcgDailyDutyRow
}

/** Upsert today's (or a given day's) completion log for a duty. */
export async function setDutyLog(input: {
  duty_id: string
  status: string
  note?: string
  date?: string
}): Promise<OcgDailyDutyLogRow> {
  const supabase = db()
  const date = input.date ?? todayInEat()
  const { data: duty } = await supabase.from('ocg_daily_duties').select('assignee_id').eq('id', input.duty_id).single()
  const { data: existing } = await supabase
    .from('ocg_daily_duty_logs')
    .select('id')
    .eq('duty_id', input.duty_id)
    .eq('duty_date', date)
    .maybeSingle()

  if (existing) {
    const { data, error } = await supabase
      .from('ocg_daily_duty_logs')
      .update({ status: input.status, note: input.note ?? '', completed_at: nowIso() })
      .eq('id', (existing as { id: string }).id)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as OcgDailyDutyLogRow
  }

  const { data, error } = await supabase
    .from('ocg_daily_duty_logs')
    .insert({
      duty_id: input.duty_id,
      assignee_id: (duty as { assignee_id: string | null } | null)?.assignee_id ?? null,
      duty_date: date,
      status: input.status,
      note: input.note ?? '',
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as OcgDailyDutyLogRow
}

/** Per-person duty completion summary for a date — for the dashboard + report. */
export interface DutyProgress {
  assignee_id: string | null
  total: number
  done: number
}

export async function dutyProgressByPerson(date = todayInEat()): Promise<DutyProgress[]> {
  const [duties, logs] = await Promise.all([listDueDuties(date), listDutyLogsForDate(date)])
  const doneByDuty = new Map(logs.map((l) => [l.duty_id, l.status]))
  const byPerson = new Map<string, DutyProgress>()
  for (const d of duties) {
    const key = d.assignee_id ?? 'unassigned'
    const row = byPerson.get(key) ?? { assignee_id: d.assignee_id, total: 0, done: 0 }
    row.total += 1
    if (doneByDuty.get(d.id) === 'done') row.done += 1
    byPerson.set(key, row)
  }
  return [...byPerson.values()]
}

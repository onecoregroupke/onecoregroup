import { db, todayInEat, nowIso } from './serverClient'
import { listTeam } from './team'
import { listTasksForAssignee } from './tasks'
import { occurrencesOn, overdueOccurrences, type DutyOccurrence } from './dutyOccurrences'
import { toOccurrenceDtos } from './dutyView'
import { isTaskClosed, type WorkItem } from './myWorkModel'
import { nairobiDateOf } from './calendarTasks'
import type { OccurrenceDto } from '@/components/duties/DutyOccurrenceCard'
import type { OpsTaskRow, NptAppointmentRow, NptCustomerRow, OpsTeamMemberRow } from '@ocg/db'

// =============================================================================
// MY WORK (§§5–10) — one employee's day, composed from the records that already
// exist.
//
// This module creates nothing and stores nothing. Duties remain derived
// occurrences over ocg_daily_duties/_logs; Assigned Tasks remain ops_tasks rows;
// appointments remain npt_appointments. Completing an item anywhere completes it
// everywhere because there is only ever one record behind it (§3).
//
// Scope is fixed to the signed-in person and CANNOT be widened by a query
// parameter — the team view lives behind its own grants at /management/duties
// and /tasks (§40.2).
// =============================================================================

/** How far back an employee's own overdue list looks. Bounded (§19). */
const OVERDUE_LOOKBACK_DAYS = 7

export interface MyAppointment {
  id: string
  title: string
  start_at: string | null
  end_at: string | null
  location: string
  status: string
  customer_name: string
  notes: string
}

export interface MyWorkData {
  member: OpsTeamMemberRow | null
  date: string
  /** Rich duty payloads for today, rendered by the canonical duty card. */
  dutiesToday: OccurrenceDto[]
  /** Rich duty payloads for unfinished occurrences from earlier days. */
  dutiesOverdue: OccurrenceDto[]
  /** Recently settled duty occurrences, for the Completed tab. */
  dutiesRecent: OccurrenceDto[]
  tasks: OpsTaskRow[]
  appointments: MyAppointment[]
  /** duty template id → the named reviewer's display name, for §15's wording. */
  reviewerNameByDuty: Record<string, string>
}

/**
 * The occurrence identity used to collapse a duty and its materialised task
 * into one displayed item (§49).
 *
 * `(duty_id, duty_date)` and nothing else. Everything that calls this is
 * already working within ONE employee's context — their My Work page, their
 * section of the morning brief — so the person is implicit and including their
 * id only creates a difference where there is none. The previous keys did
 * exactly that: the duty side appended the assignee id and the task side
 * appended an empty string, so a materialised duty task never matched its own
 * occurrence and both were shown.
 */
export function dutyOccurrenceKey(dutyId: string, date: string): string {
  return `duty:${dutyId}:${date}`
}

/** The flat item used only for bucketing and ordering (see myWorkModel). */
export function dutyToWorkItem(o: OccurrenceDto): WorkItem {
  return {
    key: dutyOccurrenceKey(o.dutyId, o.date),
    kind: 'duty',
    title: o.title,
    dueDate: o.date,
    dueAt: o.dueAt,
    priority: o.priority || 'Medium',
    status: o.status,
    overdue: o.overdue,
  }
}

export function taskToWorkItem(t: OpsTaskRow): WorkItem {
  return {
    // A task materialised FROM a duty carries the duty's occurrence identity, so
    // the pair dedupes to one item (§2). Everything else keys on its own id.
    key: t.duty_id && t.duty_date ? dutyOccurrenceKey(t.duty_id, t.duty_date) : t.task_id,
    kind: 'task',
    title: t.task_name,
    // A scheduled task is relevant on the day it is SCHEDULED, even when its
    // deadline is later (§44). Falling back to the deadline keeps every
    // unscheduled task behaving exactly as before.
    dueDate: t.scheduled_start_at ? nairobiDateOf(t.scheduled_start_at) : (t.target_date || ''),
    dueAt: t.scheduled_start_at && !t.scheduled_all_day ? t.scheduled_start_at : null,
    priority: t.priority || 'Medium',
    status: t.current_status,
    overdue: false,
  }
}

/**
 * Everything the signed-in employee has to do, from every canonical source.
 *
 * `member` is null when the account has no ops_team_members row. Callers must
 * treat that as "scoped to nothing" and say so, never as "unscoped" (§42).
 */
export async function loadMyWork(
  actor: { email: string | null; name: string },
  opts: { date?: string } = {},
): Promise<MyWorkData> {
  const date = opts.date || todayInEat()
  const team = await listTeam()
  const member = team.find(
    (m) => m.email && actor.email && m.email.toLowerCase() === actor.email.toLowerCase(),
  ) ?? null

  if (!member) {
    // No linked employee record → no duties, no appointments. Tasks are matched
    // by display name, so a name-only account still sees its assigned work.
    const tasks = actor.name ? await listTasksForAssignee(actor.name) : []
    return {
      member: null, date, dutiesToday: [], dutiesOverdue: [], dutiesRecent: [],
      tasks, appointments: [], reviewerNameByDuty: {},
    }
  }

  const [todayOcc, overdueOcc, tasks, appointments, recentOcc] = await Promise.all([
    occurrencesOn(date, { scope: { kind: 'own' }, teamMemberId: member.id }),
    overdueOccurrences({
      scope: { kind: 'own' }, teamMemberId: member.id, date, lookbackDays: OVERDUE_LOOKBACK_DAYS,
    }),
    listTasksForAssignee(member.name),
    // §50: Today shows TODAY. The forward schedule lives in the Calendar.
    appointmentsOnDate(member.id, date),
    recentSettledOccurrences(member.id, date),
  ])

  const [dutiesToday, dutiesOverdue, dutiesRecent] = await Promise.all([
    toOccurrenceDtos(todayOcc),
    toOccurrenceDtos(overdueOcc),
    toOccurrenceDtos(recentOcc),
  ])

  return {
    member,
    date,
    dutiesToday,
    dutiesOverdue,
    dutiesRecent,
    tasks,
    appointments,
    reviewerNameByDuty: reviewerNames([...todayOcc, ...overdueOcc, ...recentOcc], team),
  }
}

/** duty id → named reviewer's display name, so §15 can say "Awaiting Fatma". */
function reviewerNames(occurrences: DutyOccurrence[], team: OpsTeamMemberRow[]): Record<string, string> {
  const nameById = new Map(team.map((m) => [m.id, m.name]))
  const out: Record<string, string> = {}
  for (const o of occurrences) {
    const reviewerId = o.duty.reviewer_id
    if (reviewerId) out[o.duty.id] = nameById.get(reviewerId) ?? ''
  }
  return out
}

/**
 * Recently settled occurrences for the Completed tab.
 *
 * Reads the LOG rows directly rather than replaying the recurrence engine day
 * by day: a settled occurrence necessarily has a log row, so this needs one
 * query instead of fourteen, and cannot invent occurrences that never happened.
 */
async function recentSettledOccurrences(memberId: string, date: string): Promise<DutyOccurrence[]> {
  const since = new Date(`${date}T00:00:00Z`)
  since.setUTCDate(since.getUTCDate() - 30)
  const from = since.toISOString().slice(0, 10)

  const { data: logRows } = await db().from('ocg_daily_duty_logs').select('*')
    .eq('assignee_id', memberId)
    .in('status', ['done', 'skipped'])
    .gte('duty_date', from).lte('duty_date', date)
    .order('duty_date', { ascending: false })
    .limit(60)
  const logs = (logRows as import('@ocg/db').OcgDailyDutyLogRow[] | null) ?? []
  if (logs.length === 0) return []

  const { data: dutyRows } = await db().from('ocg_daily_duties').select('*')
    .in('id', [...new Set(logs.map((l) => l.duty_id))])
  const dutyById = new Map(
    ((dutyRows as import('@ocg/db').OcgDailyDutyRow[] | null) ?? []).map((d) => [d.id, d]),
  )

  const out: DutyOccurrence[] = []
  for (const log of logs) {
    const duty = dutyById.get(log.duty_id)
    if (!duty) continue
    out.push({
      duty,
      date: log.duty_date,
      assignee: { id: log.assignee_id, name: '', email: '' },
      dueAt: log.due_at,
      log,
      status: log.status,
      overdue: false,
      onTime: log.completed_on_time,
      checklistDone: log.checklist_done ?? 0,
      checklistTotal: log.checklist_total ?? 0,
      reviewState: log.review_state ?? 'not_required',
    })
  }
  return out
}

/**
 * Appointments on ONE day (§50).
 *
 * My Work → Today shows today. Listing the next thirty appointments under a
 * heading that says "Today" is simply wrong, and it buries the two that
 * actually matter this morning under a month of future ones. The forward
 * schedule belongs to the Calendar.
 */
export async function appointmentsOnDate(
  technicianId: string,
  date: string,
): Promise<MyAppointment[]> {
  const { data } = await openAppointments(technicianId)
    .gte('start_at', `${date}T00:00:00+03:00`)
    .lte('start_at', `${date}T23:59:59+03:00`)
    .order('start_at', { ascending: true })
    .limit(30)
  return decorate((data as NptAppointmentRow[] | null) ?? [])
}

/**
 * Upcoming engagements from now forward. Retained for callers that genuinely
 * want a forward view (the /api/my-tasks compatibility route).
 */
export async function listUpcomingAppointments(technicianId: string): Promise<MyAppointment[]> {
  const since = new Date(Date.parse(nowIso()) - 24 * 60 * 60 * 1000).toISOString()
  const { data } = await openAppointments(technicianId)
    .gte('start_at', since)
    .order('start_at', { ascending: true })
    .limit(30)
  return decorate((data as NptAppointmentRow[] | null) ?? [])
}

/** Appointments still needing attention, before any time window is applied. */
function openAppointments(technicianId: string) {
  return db()
    .from('npt_appointments')
    .select('*')
    .eq('technician_id', technicianId)
    .neq('status', 'Completed')
    .neq('status', 'Cancelled')
}

/** Attach customer names in one lookup rather than one per appointment. */
async function decorate(appointments: NptAppointmentRow[]): Promise<MyAppointment[]> {
  const supabase = db()
  if (appointments.length === 0) return []

  const customerIds = [...new Set(appointments.map((a) => a.customer_id).filter(Boolean))] as string[]
  const { data: customerRows } = customerIds.length
    ? await supabase.from('npt_customers').select('id, full_name').in('id', customerIds)
    : { data: [] }
  const customerName = new Map(
    ((customerRows as Pick<NptCustomerRow, 'id' | 'full_name'>[] | null) ?? []).map((c) => [c.id, c.full_name]),
  )

  return appointments.map((a) => ({
    id: a.id,
    title: a.title || 'Appointment',
    start_at: a.start_at,
    end_at: a.end_at,
    location: a.location,
    status: a.status,
    customer_name: a.customer_id ? customerName.get(a.customer_id) ?? '' : '',
    notes: a.notes,
  }))
}

/** Open assigned tasks, in the order the employee should work through them. */
export function openTasks(tasks: OpsTaskRow[]): OpsTaskRow[] {
  return tasks.filter((t) => !isTaskClosed(t.current_status))
}

export function completedTasks(tasks: OpsTaskRow[], limit = 30): OpsTaskRow[] {
  return tasks
    .filter((t) => isTaskClosed(t.current_status))
    .sort((a, b) => (b.last_updated_date || '').localeCompare(a.last_updated_date || ''))
    .slice(0, limit)
}

import { db, todayInEat } from './serverClient'
import { listTeam } from './team'
import { occurrencesOn } from './dutyOccurrences'
import {
  canSeeEvent, calendarPeopleScope, viewWindow, canReschedule,
  type CalendarViewer, type CalendarView, type CalendarItemType,
} from './calendarModel'
import { dueDatesBetween } from './recurrence'
import { nairobiDateOf } from './calendarTasks'
import type {
  OcgCalendarEventRow, OcgCalendarEventAttendeeRow, OcgLeaveRequestRow,
  OpsTaskRow, OcgPersonalTaskRow, OcgDailyDutyRow,
} from '@ocg/db'

// =============================================================================
// The unified calendar feed (§§5–7).
//
// One read produces every item type for a window. Crucially it READS existing
// work rather than copying it: a task on the calendar is the ops_tasks row, and
// a duty on the calendar is the derived occurrence from dutyOccurrences.ts. So
// the same occurrence rendered in My Tasks, Today, Daily Duties, the calendar,
// the morning brief and a manager report remains ONE record (§2).
// =============================================================================

export interface CalendarItem {
  id: string                    // stable composite id, unique within the feed
  type: CalendarItemType
  title: string
  date: string                  // YYYY-MM-DD
  startsAt: string | null       // ISO instant, null for all-day
  endsAt: string | null
  allDay: boolean
  status: string
  brandId: string | null
  assigneeId: string | null
  assigneeName: string
  createdById: string | null
  href: string
  /** Duty occurrences carry their template so the UI can label them (§2). */
  dutyId?: string
  /** True when the viewer may drag/resize this item (§7). */
  canMove: boolean
  meta: Record<string, unknown>
}

function betweenDates(from: string, to: string): string[] {
  const out: string[] = []
  const cur = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`).getTime()
  while (cur.getTime() <= end) {
    out.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}

async function loadViewerContext(viewer: CalendarViewer): Promise<CalendarViewer> {
  if (viewer.team != null && viewer.department != null && viewer.brandIds != null) return viewer
  const team = await listTeam()
  const me = team.find((m) => m.id === viewer.teamMemberId)
  return {
    ...viewer,
    team: me?.team ?? '',
    department: me?.department ?? '',
    brandIds: me?.brand_ids ?? [],
  }
}

/** People whose work this viewer may see on a calendar. null = everyone. */
async function visibleMemberIds(viewer: CalendarViewer): Promise<string[] | null> {
  const scope = calendarPeopleScope(viewer)
  if (scope.kind === 'all') return null
  if (scope.kind === 'own') return viewer.teamMemberId ? [viewer.teamMemberId] : []
  const team = await listTeam()
  const ids = team
    .filter((m) => (m.brand_ids ?? []).some((b) => scope.brandIds.includes(b)))
    .map((m) => m.id)
  // A manager always sees their own items even outside their managed brands.
  if (viewer.teamMemberId && !ids.includes(viewer.teamMemberId)) ids.push(viewer.teamMemberId)
  return ids
}

// ─── Sources ────────────────────────────────────────────────────────────────

/**
 * Tasks in the window (§43).
 *
 * A task can reach the calendar two ways, and they are different facts:
 *   • its SCHEDULE — when the work should be performed, placed at its time;
 *   • its DEADLINE — target_date, shown as an all-day marker.
 *
 * A scheduled task is placed by its schedule. An unscheduled task with a
 * deadline keeps behaving exactly as it did before this existed, which is what
 * keeps every task created to date on the calendar.
 */
async function tasksIn(from: string, to: string, memberIds: string[] | null, viewer: CalendarViewer): Promise<CalendarItem[]> {
  // Two windows, one union: tasks due in the range, and tasks scheduled in it.
  // A task scheduled Wednesday but due next month must still appear on Wednesday.
  const [byDeadline, bySchedule, byOccurrences] = await Promise.all([
    db().from('ops_tasks').select('*').gte('target_date', from).lte('target_date', to).limit(2000),
    db().from('ops_tasks').select('*')
      .gte('scheduled_start_at', `${from}T00:00:00+03:00`)
      .lte('scheduled_start_at', `${to}T23:59:59+03:00`)
      .limit(2000),
    db().from('ocg_schedule_occurrences').select('*')
      .gte('starts_at', `${from}T00:00:00+03:00`).lte('starts_at', `${to}T23:59:59+03:00`)
      .not('source_task_id', 'is', null).limit(2000),
  ])

  const rows = new Map<string, OpsTaskRow>()
  for (const row of [
    ...((byDeadline.data as OpsTaskRow[] | null) ?? []),
    ...((bySchedule.data as OpsTaskRow[] | null) ?? []),
  ]) rows.set(row.task_id, row)
  const occurrences = (byOccurrences.data as import('@ocg/db').OcgScheduleOccurrenceRow[] | null) ?? []
  const missingTaskIds = [...new Set(occurrences.map((occurrence) => occurrence.source_task_id).filter((id): id is string => !!id && !rows.has(id)))]
  if (missingTaskIds.length > 0) {
    const { data } = await db().from('ops_tasks').select('*').in('task_id', missingTaskIds)
    for (const row of (data as OpsTaskRow[] | null) ?? []) rows.set(row.task_id, row)
  }

  const team = await listTeam()
  const byName = new Map(team.map((m) => [m.name, m.id]))

  const visible = [...rows.values()]
    .filter((t) => {
      if (memberIds === null) return true
      const id = byName.get(t.assigned_to ?? '')
      return !!id && memberIds.includes(id)
    })
  const visibleIds = new Set(visible.map((task) => task.task_id))
  const output: CalendarItem[] = []
  for (const t of visible) {
      const assigneeId = byName.get(t.assigned_to ?? '') ?? null
      const scheduled = !!t.scheduled_start_at
      const timed = scheduled && !t.scheduled_all_day
      const common = {
        title: t.task_name, brandId: t.brand_id ?? null, assigneeId,
        assigneeName: t.assigned_to ?? '', createdById: null, href: `/tasks/${t.task_id}`,
        canMove: canReschedule(viewer, { type: 'task' as const, assigneeId }),
        meta: { taskId: t.task_id, priority: t.priority, project: t.project_name,
          description: t.task_description, category: t.category, scheduled,
          dueDate: t.target_date || null, location: t.scheduled_location || '' },
      }
      if (!t.schedule_rule_id && (scheduled ? nairobiDateOf(t.scheduled_start_at!) >= from && nairobiDateOf(t.scheduled_start_at!) <= to : t.target_date >= from && t.target_date <= to)) {
        output.push({ id: `task:${t.task_id}`, type: 'task',
          date: scheduled ? nairobiDateOf(t.scheduled_start_at!) : t.target_date,
          startsAt: timed ? t.scheduled_start_at : null, endsAt: timed ? t.scheduled_end_at : null,
          allDay: !timed, status: t.current_status, ...common })
      }
      if (scheduled && t.target_date && t.target_date >= from && t.target_date <= to
          && t.target_date !== nairobiDateOf(t.scheduled_start_at!)) {
        output.push({ id: `deadline:${t.task_id}`, type: 'deadline', date: t.target_date,
          startsAt: null, endsAt: null, allDay: true, status: t.current_status, ...common,
          title: `${t.task_name} due`, canMove: false })
      }
  }
  for (const occurrence of occurrences) {
    if (!occurrence.source_task_id || !visibleIds.has(occurrence.source_task_id)) continue
    const task = rows.get(occurrence.source_task_id)!
    const assigneeId = occurrence.assignee_id ?? byName.get(task.assigned_to ?? '') ?? null
    output.push({
      id: `task-occurrence:${occurrence.id}`, type: 'task', title: task.task_name,
      date: nairobiDateOf(occurrence.starts_at), startsAt: task.scheduled_all_day ? null : occurrence.starts_at,
      endsAt: task.scheduled_all_day ? null : occurrence.ends_at, allDay: task.scheduled_all_day,
      status: occurrence.status, brandId: task.brand_id ?? null, assigneeId,
      assigneeName: task.assigned_to ?? '', createdById: null, href: `/tasks/${task.task_id}`,
      canMove: false,
      meta: { taskId: task.task_id, occurrenceId: occurrence.id, occurrenceNumber: occurrence.occurrence_number,
        recurring: true, priority: task.priority, project: task.project_name, description: task.task_description,
        category: task.category, dueDate: task.target_date || null, location: task.scheduled_location || '' },
    })
  }
  return output
}

async function dutiesIn(from: string, to: string, viewer: CalendarViewer, memberIds: string[] | null): Promise<CalendarItem[]> {
  const scope = calendarPeopleScope(viewer)
  const dutyScope = scope.kind === 'own'
    ? { kind: 'own' as const }
    : scope.kind === 'brands'
      ? { kind: 'brands' as const, brandIds: scope.brandIds }
      : { kind: 'all' as const }

  const out: CalendarItem[] = []
  for (const date of betweenDates(from, to)) {
    const occ = await occurrencesOn(date, { scope: dutyScope, teamMemberId: viewer.teamMemberId })
    for (const o of occ) {
      if (memberIds !== null && (!o.assignee.id || !memberIds.includes(o.assignee.id))) continue
      out.push({
        // The occurrence identity — duty × date × person. Same triple as the
        // log's unique key, so this id is stable across every surface.
        id: `duty:${o.duty.id}:${date}:${o.assignee.id ?? ''}`,
        type: o.duty.duty_kind === 'inspection' ? 'inspection' : 'duty',
        title: o.duty.title,
        date,
        startsAt: o.dueAt,
        endsAt: null,
        allDay: !o.dueAt,
        status: o.status,
        brandId: o.duty.brand_id,
        assigneeId: o.assignee.id,
        assigneeName: o.assignee.name,
        createdById: null,
        // The occurrence is completed in My Work, which is where the rich duty
        // controls live (§5). /duties still resolves here for older links.
        href: `/my-work?tab=duties&date=${date}`,
        dutyId: o.duty.id,
        canMove: canReschedule(viewer, { type: 'duty' }),
        meta: {
          dutyKind: o.duty.duty_kind,
          overdue: o.overdue,
          onTime: o.onTime,
          checklistDone: o.checklistDone,
          checklistTotal: o.checklistTotal,
          reviewState: o.reviewState,
          recurring: true,
        },
      })
    }
  }
  return out
}

async function eventsIn(from: string, to: string, viewer: CalendarViewer): Promise<CalendarItem[]> {
  const [baseQuery, occurrenceQuery] = await Promise.all([
    db().from('ocg_calendar_events').select('*')
      .lte('starts_at', `${to}T23:59:59Z`).or(`ends_at.gte.${from}T00:00:00Z,ends_at.is.null`)
      .neq('status', 'cancelled').limit(1000),
    db().from('ocg_schedule_occurrences').select('*')
      .gte('starts_at', `${from}T00:00:00+03:00`).lte('starts_at', `${to}T23:59:59+03:00`)
      .not('source_event_id', 'is', null).limit(1000),
  ])
  const eventMap = new Map(((baseQuery.data as OcgCalendarEventRow[] | null) ?? []).map((event) => [event.id, event]))
  const occurrences = (occurrenceQuery.data as import('@ocg/db').OcgScheduleOccurrenceRow[] | null) ?? []
  const missingIds = [...new Set(occurrences.map((occurrence) => occurrence.source_event_id).filter((id): id is string => !!id && !eventMap.has(id)))]
  if (missingIds.length > 0) {
    const { data } = await db().from('ocg_calendar_events').select('*').in('id', missingIds).neq('status', 'cancelled')
    for (const event of (data as OcgCalendarEventRow[] | null) ?? []) eventMap.set(event.id, event)
  }
  const events = [...eventMap.values()]
  if (events.length === 0) return []

  const { data: att } = await db().from('ocg_calendar_event_attendees')
    .select('*').in('event_id', events.map((e) => e.id))
  const attendeesByEvent = new Map<string, string[]>()
  for (const a of (att as OcgCalendarEventAttendeeRow[] | null) ?? []) {
    const list = attendeesByEvent.get(a.event_id) ?? []
    if (a.team_member_id) list.push(a.team_member_id)
    attendeesByEvent.set(a.event_id, list)
  }

  const visible = new Map(events
    .filter((event) => canSeeEvent(viewer, { ...event, attendee_member_ids: attendeesByEvent.get(event.id) ?? [] }))
    .map((event) => [event.id, event]))
  const output: CalendarItem[] = []
  for (const event of visible.values()) {
    if (event.schedule_rule_id) continue
    output.push({
      id: `event:${event.id}`, type: event.event_kind === 'meeting' ? 'meeting' : 'event',
      title: event.title, date: nairobiDateOf(event.starts_at), startsAt: event.all_day ? null : event.starts_at,
      endsAt: event.all_day ? null : event.ends_at, allDay: event.all_day, status: event.status,
      brandId: event.brand_id, assigneeId: null, assigneeName: event.created_by,
      createdById: event.created_by_id, href: `/calendar/events/${event.id}`,
      canMove: canReschedule(viewer, { type: 'event', createdById: event.created_by_id }),
      meta: { eventKind: event.event_kind, location: event.location, visibility: event.visibility,
        description: event.description, notes: event.notes, attendeeIds: attendeesByEvent.get(event.id) ?? [] },
    })
  }
  for (const occurrence of occurrences) {
    if (!occurrence.source_event_id) continue
    const event = visible.get(occurrence.source_event_id)
    if (!event) continue
    output.push({
      id: `event-occurrence:${occurrence.id}`, type: event.event_kind === 'meeting' ? 'meeting' : 'event',
      title: event.title, date: nairobiDateOf(occurrence.starts_at), startsAt: event.all_day ? null : occurrence.starts_at,
      endsAt: event.all_day ? null : occurrence.ends_at, allDay: event.all_day, status: occurrence.status,
      brandId: event.brand_id, assigneeId: null, assigneeName: event.created_by,
      createdById: event.created_by_id, href: `/calendar/events/${event.id}`, canMove: false,
      meta: { eventKind: event.event_kind, location: event.location, visibility: event.visibility,
        description: event.description, notes: event.notes, attendeeIds: attendeesByEvent.get(event.id) ?? [],
        occurrenceId: occurrence.id, occurrenceNumber: occurrence.occurrence_number, recurring: true },
    })
  }
  return output
}

async function leaveIn(from: string, to: string, memberIds: string[] | null): Promise<CalendarItem[]> {
  let q = db().from('ocg_leave_requests').select('*')
    .lte('start_date', to).gte('end_date', from)
    .eq('status', 'approved').limit(500)
  if (memberIds !== null) q = q.in('team_member_id', memberIds)
  const rows = ((await q).data as OcgLeaveRequestRow[] | null) ?? []
  const team = await listTeam()
  const nameById = new Map(team.map((m) => [m.id, m.name]))

  return rows.map((l) => ({
    id: `leave:${l.id}`,
    type: 'leave' as const,
    title: `${nameById.get(l.team_member_id) ?? 'Leave'} — ${l.leave_type}`,
    date: l.start_date,
    startsAt: null, endsAt: null, allDay: true,
    status: l.status,
    brandId: l.brand_id,
    assigneeId: l.team_member_id,
    assigneeName: nameById.get(l.team_member_id) ?? '',
    createdById: null,
    href: `/calendar/leave/${l.id}`,
    canMove: false,
    meta: { leaveType: l.leave_type, endDate: l.end_date, days: l.days_count },
  }))
}

async function personalTasksIn(from: string, to: string, viewer: CalendarViewer): Promise<CalendarItem[]> {
  if (!viewer.teamMemberId) return []
  // Personal tasks are private by construction — only ever the viewer's own.
  const { data } = await db().from('ocg_personal_tasks').select('*')
    .eq('owner_email', (viewer.email ?? '').toLowerCase())
    .gte('due_date', from).lte('due_date', to).limit(500)
  return ((data as OcgPersonalTaskRow[] | null) ?? []).map((t) => ({
    id: `personal:${t.id}`,
    type: 'personal_task' as const,
    title: t.title,
    date: t.due_date ?? from,
    startsAt: null, endsAt: null, allDay: true,
    status: t.status,
    brandId: null,
    assigneeId: viewer.teamMemberId,
    assigneeName: '',
    createdById: viewer.teamMemberId,
    href: '/personal',
    canMove: true,
    meta: { personal: true },
  }))
}

// ─── Feed ───────────────────────────────────────────────────────────────────

export interface CalendarFeedOptions {
  view?: CalendarView
  date?: string
  from?: string
  to?: string
  types?: CalendarItemType[]
  brandIds?: string[]
  memberIds?: string[]
}

/**
 * Every calendar item the viewer may see in a window, from every source.
 * Permission filtering happens per source — there is no post-hoc "strip the
 * private ones" pass that a new source could forget to run.
 */
export async function calendarFeed(
  rawViewer: CalendarViewer,
  opts: CalendarFeedOptions = {},
): Promise<{ from: string; to: string; items: CalendarItem[] }> {
  const viewer = await loadViewerContext(rawViewer)
  const anchor = opts.date ?? todayInEat()
  const window = opts.from && opts.to
    ? { from: opts.from, to: opts.to }
    : viewWindow(opts.view ?? 'week', anchor)

  const scopedMembers = await visibleMemberIds(viewer)
  // An explicit member filter can only NARROW what the scope already allows.
  const memberIds = opts.memberIds
    ? (scopedMembers === null ? opts.memberIds : opts.memberIds.filter((m) => scopedMembers.includes(m)))
    : scopedMembers

  const wanted = new Set<CalendarItemType>(opts.types ?? [...['task', 'personal_task', 'duty', 'inspection', 'meeting', 'event', 'leave', 'deadline'] as CalendarItemType[]])

  const parts = await Promise.all([
    (wanted.has('task') || wanted.has('deadline')) ? tasksIn(window.from, window.to, memberIds, viewer) : [],
    (wanted.has('duty') || wanted.has('inspection')) ? dutiesIn(window.from, window.to, viewer, memberIds) : [],
    (wanted.has('event') || wanted.has('meeting')) ? eventsIn(window.from, window.to, viewer) : [],
    wanted.has('leave') ? leaveIn(window.from, window.to, memberIds) : [],
    wanted.has('personal_task') ? personalTasksIn(window.from, window.to, viewer) : [],
  ])

  const items = parts.flat()
    .filter((i) => wanted.has(i.type))
    .filter((i) => !opts.brandIds?.length || (i.brandId != null && opts.brandIds.includes(i.brandId)))
    .sort((a, b) => (a.date === b.date
      ? (a.startsAt ?? '').localeCompare(b.startsAt ?? '')
      : a.date.localeCompare(b.date)))

  return { ...window, items }
}

/** Group a feed by date — what day/week/month views render from. */
export function groupByDate(items: CalendarItem[]): Map<string, CalendarItem[]> {
  const map = new Map<string, CalendarItem[]>()
  for (const item of items) {
    const list = map.get(item.date) ?? []
    list.push(item)
    map.set(item.date, list)
  }
  return map
}

/** Record a reschedule (§7 "Every reschedule should be audited"). */
export async function recordReschedule(input: {
  entity_type: string
  entity_id: string
  previous_date?: string | null
  new_date?: string | null
  previous_start?: string | null
  new_start?: string | null
  previous_end?: string | null
  new_end?: string | null
  reason?: string
  moved_by: string
  moved_by_id?: string | null
  source?: string
}): Promise<void> {
  await db().from('ocg_calendar_reschedules').insert({
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    previous_date: input.previous_date ?? null,
    new_date: input.new_date ?? null,
    previous_start: input.previous_start ?? null,
    new_start: input.new_start ?? null,
    previous_end: input.previous_end ?? null,
    new_end: input.new_end ?? null,
    reason: input.reason ?? '',
    moved_by: input.moved_by,
    moved_by_id: input.moved_by_id ?? null,
    source: input.source ?? 'calendar_drag',
  })
}

/** Upcoming due dates for a duty template — used by the duty detail page. */
export function upcomingDutyDates(duty: OcgDailyDutyRow, fromISO: string, days = 30): string[] {
  const end = new Date(`${fromISO}T00:00:00Z`)
  end.setUTCDate(end.getUTCDate() + days)
  return dueDatesBetween(duty, fromISO, end.toISOString().slice(0, 10))
}

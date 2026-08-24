import { db, todayInEat } from './serverClient'
import { listTeam } from './team'
import { occurrencesOn } from './dutyOccurrences'
import {
  canSeeEvent, calendarPeopleScope, viewWindow, canReschedule,
  type CalendarViewer, type CalendarView, type CalendarItemType,
} from './calendarModel'
import { dueDatesBetween } from './recurrence'
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

async function tasksIn(from: string, to: string, memberIds: string[] | null, viewer: CalendarViewer): Promise<CalendarItem[]> {
  const q = db().from('ops_tasks').select('*')
    .gte('target_date', from).lte('target_date', to).limit(2000)
  const { data } = await q
  const rows = (data as OpsTaskRow[] | null) ?? []
  const team = await listTeam()
  const byName = new Map(team.map((m) => [m.name, m.id]))

  return rows
    .filter((t) => {
      if (memberIds === null) return true
      const id = byName.get(t.assigned_to ?? '')
      return !!id && memberIds.includes(id)
    })
    .map((t) => {
      const assigneeId = byName.get(t.assigned_to ?? '') ?? null
      return {
        id: `task:${t.task_id}`,
        type: 'task' as const,
        title: t.task_name,
        date: t.target_date,
        startsAt: null, endsAt: null, allDay: true,
        status: t.current_status,
        brandId: t.brand_id ?? null,
        assigneeId,
        assigneeName: t.assigned_to ?? '',
        createdById: null,
        href: `/tasks/${t.task_id}`,
        canMove: canReschedule(viewer, { type: 'task', assigneeId }),
        meta: { taskId: t.task_id, priority: t.priority, project: t.project_name },
      }
    })
}

async function dutiesIn(from: string, to: string, viewer: CalendarViewer): Promise<CalendarItem[]> {
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
  const { data } = await db().from('ocg_calendar_events').select('*')
    .lte('starts_at', `${to}T23:59:59Z`)
    .or(`ends_at.gte.${from}T00:00:00Z,ends_at.is.null`)
    .neq('status', 'cancelled')
    .limit(1000)
  const events = (data as OcgCalendarEventRow[] | null) ?? []
  if (events.length === 0) return []

  const { data: att } = await db().from('ocg_calendar_event_attendees')
    .select('*').in('event_id', events.map((e) => e.id))
  const attendeesByEvent = new Map<string, string[]>()
  for (const a of (att as OcgCalendarEventAttendeeRow[] | null) ?? []) {
    const list = attendeesByEvent.get(a.event_id) ?? []
    if (a.team_member_id) list.push(a.team_member_id)
    attendeesByEvent.set(a.event_id, list)
  }

  return events
    .filter((e) => canSeeEvent(viewer, { ...e, attendee_member_ids: attendeesByEvent.get(e.id) ?? [] }))
    .map((e) => ({
      id: `event:${e.id}`,
      type: 'event' as const,
      title: e.title,
      date: e.starts_at.slice(0, 10),
      startsAt: e.all_day ? null : e.starts_at,
      endsAt: e.all_day ? null : e.ends_at,
      allDay: e.all_day,
      status: e.status,
      brandId: e.brand_id,
      assigneeId: null,
      assigneeName: e.created_by,
      createdById: e.created_by_id,
      href: `/calendar/events/${e.id}`,
      canMove: canReschedule(viewer, { type: 'event', createdById: e.created_by_id }),
      meta: { eventKind: e.event_kind, location: e.location, visibility: e.visibility },
    }))
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

  const wanted = new Set<CalendarItemType>(opts.types ?? [...['task', 'personal_task', 'duty', 'inspection', 'meeting', 'event', 'leave'] as CalendarItemType[]])

  const parts = await Promise.all([
    wanted.has('task') ? tasksIn(window.from, window.to, memberIds, viewer) : [],
    (wanted.has('duty') || wanted.has('inspection')) ? dutiesIn(window.from, window.to, viewer) : [],
    wanted.has('event') ? eventsIn(window.from, window.to, viewer) : [],
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

// Assigning an Ops Task from the calendar (§§22–26). Pure — no I/O — so the
// page, the composer and the tests agree on who may assign what, to whom.
//
// The one rule this file exists to protect: the calendar is an INPUT STATION.
// It produces a payload for the canonical POST /api/tasks and nothing else. No
// calendar-specific task record, no direct Supabase insert, no second
// assignment email. Everything downstream stays owned by the task engine.

import type { PermissionsMap } from '@ocg/db'
import { can, type TaskScope } from './permissions'

export interface AssignableProject {
  id: string
  label: string
  brandId: string | null
  brandLabel: string
}

export interface AssignablePerson {
  id: string
  name: string
}

/**
 * Whether this actor may assign tasks at all.
 *
 * Deliberately the SAME expression POST /api/tasks applies before creating a
 * task. §23: "Do not determine task-assignment authority using only a
 * client-side manager role string." Resolving it from the permissions map, on
 * the server, is what makes the hidden menu item a courtesy rather than the
 * control.
 */
export function canAssignTaskFromCalendar(
  permissions: PermissionsMap | null,
  isSuperAdmin: boolean,
): boolean {
  return can(permissions, 'ops', 'edit') || isSuperAdmin
}

/**
 * The projects this actor may assign work under.
 *
 * A brand manager is confined to their brands — the same check POST /api/tasks
 * re-runs on submit. Offering a project the server will refuse would be a
 * misleading menu; enforcing it ONLY here would be no enforcement at all, which
 * is why both exist.
 */
export function assignableProjects<T extends { brandId: string | null }>(
  projects: T[],
  scope: TaskScope,
): T[] {
  if (scope.kind !== 'brands') return projects
  return projects.filter((p) => !!p.brandId && scope.brandIds.includes(p.brandId))
}

/** The people this actor may assign work to, under the same brand confinement. */
export function assignablePeople<T extends { brandIds: string[] }>(
  people: T[],
  scope: TaskScope,
): T[] {
  if (scope.kind !== 'brands') return people
  return people.filter((m) => m.brandIds.some((b) => scope.brandIds.includes(b)))
}

/**
 * §46: may this actor assign work to this person?
 *
 * Filtering the dropdown is presentation. This is the rule the SERVER applies,
 * because a crafted POST does not go through the dropdown. Checking only that
 * the PROJECT is in scope was insufficient: a brand manager could name any
 * employee in the company as the assignee on their own brand's project.
 *
 * `assigneeBrandIds` null means the named assignee could not be resolved to an
 * employee record at all.
 */
export function canAssignToMember(
  scope: TaskScope,
  assigneeBrandIds: string[] | null,
): boolean {
  if (scope.kind !== 'brands') return true
  // A scoped manager may only assign to someone who shares one of their brands.
  // An unresolvable or brand-less assignee is refused rather than allowed
  // through — "we could not tell" is not "it is fine".
  if (!assigneeBrandIds) return false
  return assigneeBrandIds.some((b) => scope.brandIds.includes(b))
}

export interface TaskComposerForm {
  task_name: string
  project_id: string
  assigned_to: string
  priority: string
  category: string
  task_description: string
  // ── Schedule: WHEN the person should do the work (§41) ──
  /** YYYY-MM-DD. Empty = no scheduled time, deadline only. */
  schedule_date: string
  all_day: boolean
  /** HH:MM, Nairobi wall clock. */
  start_time: string
  end_time: string
  location: string
  // ── Deadline: the date the work must be FINISHED by ──
  target_date: string
}

export interface TaskCreatePayload {
  task_name: string
  project_id: string
  assigned_to: string
  priority: string
  category: string
  target_date: string
  task_description: string
  scheduled_start_at: string | null
  scheduled_end_at: string | null
  scheduled_all_day: boolean
  scheduled_location: string
}

/**
 * Africa/Nairobi is UTC+3 all year with no daylight saving, so a fixed offset is
 * exact rather than an approximation. Any other zone would need a real timezone
 * database and this helper would be the wrong tool.
 */
export const NAIROBI_OFFSET = '+03:00'

/** A Nairobi wall-clock date and time as an unambiguous instant. */
export function nairobiInstant(date: string, time: string): string {
  return `${date}T${time}:00${NAIROBI_OFFSET}`
}

/**
 * The scheduled window for a form, or nulls when nothing is scheduled.
 *
 * An all-day scheduled task still gets a window — the whole Nairobi day — so the
 * calendar can place it on that date without inventing a time.
 */
export function scheduleWindow(form: TaskComposerForm): {
  start: string | null
  end: string | null
  allDay: boolean
} {
  if (!form.schedule_date) return { start: null, end: null, allDay: false }
  if (form.all_day) {
    return {
      start: nairobiInstant(form.schedule_date, '00:00'),
      end: nairobiInstant(form.schedule_date, '23:59'),
      allDay: true,
    }
  }
  return {
    start: nairobiInstant(form.schedule_date, form.start_time),
    end: nairobiInstant(form.schedule_date, form.end_time),
    allDay: false,
  }
}

/**
 * The body sent to POST /api/tasks.
 *
 * Note what is absent: no brand_id. createTask() inherits brand and client from
 * the project, so sending a brand here would create a second opinion about which
 * brand the task belongs to — and eventually a disagreement.
 *
 * Note also what is NOT conflated: `target_date` is the DEADLINE and
 * `scheduled_*` is the WORKING WINDOW. A task scheduled Wednesday 10:00–12:00
 * and due Friday carries both, and neither is derived from the other (§41).
 */
export function buildTaskPayload(form: TaskComposerForm): TaskCreatePayload {
  const window = scheduleWindow(form)
  return {
    task_name: form.task_name.trim(),
    project_id: form.project_id,
    assigned_to: form.assigned_to,
    priority: form.priority,
    category: form.category,
    target_date: form.target_date,
    task_description: form.task_description,
    scheduled_start_at: window.start,
    scheduled_end_at: window.end,
    scheduled_all_day: window.allDay,
    scheduled_location: form.location.trim(),
  }
}

/** What must be filled in before the payload is worth sending. */
export function validateTaskForm(form: TaskComposerForm): string | null {
  if (!form.task_name.trim()) return 'A task title is required.'
  if (!form.project_id) return 'Choose the project this task belongs to.'
  if (form.schedule_date && !form.all_day) {
    if (!form.start_time || !form.end_time) return 'Set a start and end time, or mark it all day.'
    if (form.end_time < form.start_time) return 'The end time is before the start time.'
  }
  if (form.target_date && form.schedule_date && form.target_date < form.schedule_date) {
    return 'The deadline is before the day the work is scheduled.'
  }
  return null
}

/**
 * The composer's initial state for a clicked calendar day (§42).
 *
 * The clicked day prefills the SCHEDULE date. The deadline defaults to the same
 * day as a sensible starting point, but it is a separate field the user edits
 * independently — the two are never bound together.
 */
export function initialTaskForm(date: string, defaultProjectId: string): TaskComposerForm {
  return {
    task_name: '',
    project_id: defaultProjectId,
    assigned_to: '',
    priority: 'Medium',
    category: 'Operations',
    task_description: '',
    schedule_date: date,
    all_day: false,
    start_time: '09:00',
    end_time: '10:00',
    location: '',
    target_date: date,
  }
}

/** "10:00–12:00" for a scheduled task, or '' when it carries no window (§43). */
export function formatScheduleRange(
  startAt: string | null,
  endAt: string | null,
  allDay = false,
): string {
  if (!startAt) return ''
  if (allDay) return 'All day'
  const time = (iso: string) => new Date(iso).toLocaleTimeString('en-KE', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Nairobi',
  })
  return endAt ? `${time(startAt)}–${time(endAt)}` : time(startAt)
}

/** The Nairobi calendar date a scheduled instant falls on. */
export function nairobiDateOf(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' })
}

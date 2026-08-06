// Pure calendar rules (§§5–7). No I/O — unit-tested in calendarModel.test.ts.
//
// The whole point of this file is the visibility question: WHO may see WHICH
// item on a calendar. A calendar is the surface where an over-broad default
// quietly exposes an entire team's movements, so every decision here defaults
// closed and is asserted by a test.

import type { PermissionsMap, BrandAccessMap } from '@ocg/db'
import { can, allowedBrands } from './permissions'

export const CALENDAR_VIEWS = ['day', 'week', 'month', 'agenda'] as const
export type CalendarView = (typeof CALENDAR_VIEWS)[number]

export const CALENDAR_EVENT_KINDS = [
  'event', 'meeting', 'training', 'stock_count', 'holiday',
  'maintenance', 'campaign', 'production_deadline', 'leave', 'reminder',
] as const
export type CalendarEventKind = (typeof CALENDAR_EVENT_KINDS)[number]

/** Every kind of thing that can appear on a calendar (§6). */
export const CALENDAR_ITEM_TYPES = [
  'task', 'personal_task', 'duty', 'meeting', 'event',
  'inspection', 'leave', 'deadline',
] as const
export type CalendarItemType = (typeof CALENDAR_ITEM_TYPES)[number]

export interface CalendarViewer {
  permissions: PermissionsMap | null
  brandAccess: BrandAccessMap | null
  teamMemberId: string | null
  email: string | null
  team?: string | null
  department?: string | null
  brandIds?: string[]
}

export interface VisibleEvent {
  id: string
  visibility: string
  brand_id?: string | null
  visibility_team?: string | null
  visibility_department?: string | null
  visibility_user_ids?: string[] | null
  created_by_id?: string | null
  attendee_member_ids?: string[]
}

const eq = (a?: string | null, b?: string | null) =>
  !!(a ?? '').trim() && (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()

/**
 * May this viewer see this event?
 *
 * Note what is deliberately NOT here: a manager grant does not by itself unlock
 * private events. §6 says "Do not automatically expose every employee's entire
 * private calendar to every manager", so `private` resolves to creator-and-
 * attendees only, for everybody — the founding admin included.
 */
export function canSeeEvent(viewer: CalendarViewer, event: VisibleEvent): boolean {
  const mine = !!viewer.teamMemberId && event.created_by_id === viewer.teamMemberId
  if (mine) return true
  if ((event.attendee_member_ids ?? []).includes(viewer.teamMemberId ?? '')) return true

  switch (event.visibility) {
    case 'private':
      return false
    case 'users':
      return (event.visibility_user_ids ?? []).includes(viewer.teamMemberId ?? '')
    case 'team':
      return eq(event.visibility_team, viewer.team)
    case 'department':
      return eq(event.visibility_department, viewer.department)
    case 'brand':
      return !!event.brand_id && (viewer.brandIds ?? []).includes(event.brand_id)
    case 'company':
      return true
    default:
      return false // unknown band → closed
  }
}

/**
 * Whose schedules this viewer may load, beyond their own (§6 "Managerial
 * calendar"). Returns null for unrestricted, or the brand ids they manage.
 * `false` means "own schedule only".
 */
export type CalendarPeopleScope =
  | { kind: 'all' }
  | { kind: 'brands'; brandIds: string[] }
  | { kind: 'own' }

export function calendarPeopleScope(viewer: CalendarViewer): CalendarPeopleScope {
  const p = viewer.permissions
  if (p === null) return { kind: 'all' }
  // A team calendar needs an explicit grant. Task oversight (all_tasks) implies
  // it, because a manager who can already see the tasks gains nothing by being
  // denied the calendar rendering of the same tasks.
  const granted = can(p, 'calendar_team', 'view') || can(p, 'all_tasks', 'view')
  if (!granted) return { kind: 'own' }
  const scoped =
    allowedBrands(viewer.brandAccess, 'calendar_team') ??
    allowedBrands(viewer.brandAccess, 'all_tasks')
  return scoped === null ? { kind: 'all' } : { kind: 'brands', brandIds: scoped }
}

/** May this viewer create company/brand calendar events (§6 "Company calendar")? */
export function canCreateEvent(viewer: CalendarViewer, visibility: string, brandId: string | null): boolean {
  if (viewer.permissions === null) return true
  // Anyone may create something only they (or named invitees) will see.
  if (visibility === 'private' || visibility === 'users') return true
  if (!can(viewer.permissions, 'calendar_events', 'edit')) return false
  const scope = allowedBrands(viewer.brandAccess, 'calendar_events')
  if (scope === null) return true
  // A brand-scoped organiser cannot announce to the whole company.
  if (visibility === 'company') return false
  if (visibility === 'brand') return !!brandId && scope.includes(brandId)
  return true
}

/**
 * §7: "Do not allow a user to reschedule a manager-assigned task simply by
 * dragging it unless they have permission."
 *
 * The assignee is NOT automatically allowed to move their own assigned work —
 * that is precisely the case the brief calls out. They may move what they
 * created themselves (a personal task, their own event).
 */
export function canReschedule(
  viewer: CalendarViewer,
  item: { type: CalendarItemType; createdById?: string | null; assigneeId?: string | null },
): boolean {
  if (viewer.permissions === null) return true
  if (item.type === 'personal_task') return item.assigneeId === viewer.teamMemberId
  if (item.createdById && item.createdById === viewer.teamMemberId) return true
  if (item.type === 'task') return can(viewer.permissions, 'all_tasks', 'edit')
  if (item.type === 'duty') return can(viewer.permissions, 'duties', 'edit')
  if (item.type === 'event') return can(viewer.permissions, 'calendar_events', 'edit')
  return false
}

// ─── View windows ───────────────────────────────────────────────────────────

function iso(d: Date): string { return d.toISOString().slice(0, 10) }

/** Inclusive [from, to] date window for a view anchored on `dateISO`.
 *  Weeks run Monday–Sunday, matching how the team already plans. */
export function viewWindow(view: CalendarView, dateISO: string): { from: string; to: string } {
  const anchor = new Date(`${dateISO}T00:00:00Z`)
  switch (view) {
    case 'day':
      return { from: dateISO, to: dateISO }
    case 'week': {
      const dow = anchor.getUTCDay()            // 0=Sun
      const backToMonday = (dow + 6) % 7        // Mon→0, Sun→6
      const start = new Date(anchor); start.setUTCDate(start.getUTCDate() - backToMonday)
      const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6)
      return { from: iso(start), to: iso(end) }
    }
    case 'month': {
      const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1))
      const end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0))
      return { from: iso(start), to: iso(end) }
    }
    case 'agenda': {
      const end = new Date(anchor); end.setUTCDate(end.getUTCDate() + 29)
      return { from: dateISO, to: iso(end) }
    }
  }
}

/** The month grid a month view renders: whole weeks, Monday-first. */
export function monthGridWindow(dateISO: string): { from: string; to: string } {
  const { from, to } = viewWindow('month', dateISO)
  return { from: viewWindow('week', from).from, to: viewWindow('week', to).to }
}

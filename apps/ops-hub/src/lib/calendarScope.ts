import type { OpsTeamMemberRow } from '@ocg/db'
import type { CalendarViewer } from './calendarModel'
import { calendarPeopleScope } from './calendarModel'

/**
 * The named calendars a person switches between (§6).
 *
 *   personal    — only my own work
 *   team        — my team
 *   department  — my department
 *   company     — everyone I am permitted to see
 *   management  — everyone I manage, for the oversight view
 *
 * These are RESOLVED SERVER-SIDE into member-id lists. The client never names
 * individual people, so it cannot enumerate the roster by probing ids, and the
 * result is still intersected with the viewer's permission scope inside
 * calendarFeed() — a named scope can only narrow, never widen.
 */
export const CALENDAR_SCOPES = ['personal', 'team', 'department', 'company', 'management'] as const
export type CalendarScope = (typeof CALENDAR_SCOPES)[number]

export const CALENDAR_SCOPE_LABELS: Record<CalendarScope, string> = {
  personal: 'My calendar',
  team: 'Team',
  department: 'Department',
  company: 'Company',
  management: 'Management',
}

const eq = (a?: string | null, b?: string | null) =>
  !!(a ?? '').trim() && (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()

/**
 * Member ids for a named scope, or null for "no people filter" (which
 * calendarFeed then narrows to the viewer's permission scope anyway).
 *
 * Returning `[viewer]` rather than null for an unresolvable team/department is
 * deliberate: a person with no team recorded sees themselves, never everybody.
 */
export async function resolveScopeMembers(
  scope: CalendarScope,
  viewer: CalendarViewer,
  team: OpsTeamMemberRow[],
): Promise<string[] | undefined> {
  const mine = viewer.teamMemberId ? [viewer.teamMemberId] : []

  switch (scope) {
    case 'personal':
      return mine
    case 'team': {
      const ids = team.filter((m) => eq((m as { team?: string }).team, viewer.team)).map((m) => m.id)
      return ids.length > 0 ? ids : mine
    }
    case 'department': {
      const ids = team.filter((m) => eq(m.department, viewer.department)).map((m) => m.id)
      return ids.length > 0 ? ids : mine
    }
    case 'company':
    case 'management':
      // No explicit people filter — calendarFeed applies the permission scope,
      // so a viewer with no team grant still only sees their own work here.
      return undefined
    default:
      return mine
  }
}

/** Scopes this viewer may actually choose between. */
export function availableScopes(viewer: CalendarViewer): CalendarScope[] {
  const peopleScope = calendarPeopleScope(viewer)
  if (peopleScope.kind === 'own') return ['personal']
  const out: CalendarScope[] = ['personal']
  if ((viewer.team ?? '').trim()) out.push('team')
  if ((viewer.department ?? '').trim()) out.push('department')
  out.push('company')
  if (peopleScope.kind === 'brands' || peopleScope.kind === 'all') out.push('management')
  return out
}

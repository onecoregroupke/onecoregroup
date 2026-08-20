import type {
  SectionKey, AccessLevel, PermissionsMap, BrandAccessMap,
  RecordAccessLevel, RecordAccessMap,
} from '@ocg/db'

export type { SectionKey, AccessLevel, PermissionsMap, BrandAccessMap, RecordAccessLevel, RecordAccessMap }

export interface SectionDef {
  key: SectionKey
  label: string
  href: string
}

/**
 * Sections the Ops Hub gates on. Two keys cover the whole app:
 *   ops        — the task delivery system (dashboard, tasks, projects, clients)
 *   ops_agents — the agent run/config surface
 *   management / finance / npt_service / rayyan_admin / rhythms_admin — narrower operational modules.
 *     If unset for an existing user, they inherit the broader `ops` grant.
 *   meetings — GRANT means "view EVERY meeting" (optionally brand-scoped). No
 *     inheritance: without this grant a user is participant-scoped (sees only
 *     the meetings they created or are an attendee of).
 *   inventory / procurement — stock + purchasing. NO inheritance: like money,
 *     these require an explicit grant.
 * "My Tasks", Chat, and the Forum are always visible to any signed-in user.
 */
export const SECTIONS: SectionDef[] = [
  { key: 'ops',        label: 'Ops',    href: '/' },
  { key: 'management', label: 'Management', href: '/management' },
  { key: 'meetings', label: 'Meetings (view all)', href: '/meetings' },
  { key: 'finance', label: 'Finance', href: '/finance' },
  { key: 'inventory', label: 'Inventory', href: '/inventory' },
  { key: 'procurement', label: 'Procurement', href: '/procurement' },
  { key: 'people', label: 'People · Role & Capability', href: '/management/team' },
  { key: 'knowledge', label: 'Group Knowledge', href: '/knowledge' },
  { key: 'historical_imports', label: 'Historical Imports', href: '/historical-imports' },
  { key: 'forms', label: 'Forms (fill · edit = build)', href: '/forms' },
  { key: 'forms_responses', label: 'Form responses (view · edit = export)', href: '/forms' },
  { key: 'forms_approvals', label: 'Form approvals (review submissions)', href: '/forms' },
  // Duties (055). Seeing and completing YOUR OWN duties needs no grant — these
  // three are the manager-side capabilities. See lib/dutyModel.ts `dutyCan`.
  { key: 'duties', label: 'Duties (edit = create · assign · pause)', href: '/duties' },
  { key: 'duties_all', label: "Duties (view all team members')", href: '/management/duties' },
  { key: 'duties_review', label: 'Duty review (accept / reopen)', href: '/management/duties' },
  // Calendar (056). A personal calendar is implicit for every signed-in user.
  { key: 'calendar_team', label: 'Calendar (team / department / company)', href: '/calendar' },
  { key: 'calendar_events', label: 'Calendar events (edit = create shared)', href: '/calendar' },
  { key: 'npt_service', label: 'NPT Service', href: '/npt' },
  { key: 'rayyan_admin', label: 'Rayyan Admin', href: '/rayyan' },
  { key: 'rhythms_admin', label: 'Rhythms Admin', href: '/rhythms' },
  { key: 'darul_admin', label: 'Darul Swafa Admin', href: '/darul' },
  { key: 'nuuranest_admin', label: 'Nuuranest Admin', href: '/nuuranest' },
  { key: 'glitz_admin', label: "Glitz N' Glim Admin", href: '/glitz' },
  { key: 'ops_agents', label: 'Agents', href: '/agents' },
]

/**
 * Marketing Hub sections. The Marketing Hub is a self-contained workspace that
 * now lives inside the Ops Hub (mounted at `/mhub`, opens in a new tab). Each
 * key gates one marketing surface so access can be scoped per-role exactly like
 * the ops modules. These are surfaced in the Portal Access matrix under a
 * "Marketing Hub" heading. `users` is intentionally omitted — it is the shared
 * key already granted via USERS_SECTION and controls user admin in both hubs.
 */
export const MARKETING_SECTIONS: SectionDef[] = [
  { key: 'marketing',  label: 'Marketing board', href: '/mhub/marketing/calendar' },
  { key: 'dashboard',  label: 'Marketing dashboard', href: '/mhub' },
  { key: 'input',      label: 'Input portal', href: '/mhub/input' },
  { key: 'compliance', label: 'Compliance', href: '/mhub/compliance' },
  { key: 'properties', label: 'Properties', href: '/mhub/properties' },
  { key: 'glitz',      label: "Glitz N' Glim", href: '/mhub/glitz' },
  { key: 'npt',        label: 'NPT Catalogue', href: '/mhub/npt' },
  { key: 'reports',    label: 'Marketing reports', href: '/mhub/reports' },
  { key: 'brands',     label: 'Brands', href: '/mhub/brands' },
]

/**
 * Sections whose access can additionally be restricted to specific brands via
 * `user_permissions.brand_access` (section → brand UUID array). An empty /
 * missing list means "all brands". This is how a per-brand accountant or
 * storekeeper is created: grant the section, then scope it to their brand.
 *
 * `all_tasks` scoped to brands is the BRAND MANAGER: they see every task in
 * their brand(s) (not just their own), can assign within their team, get the
 * per-brand ops report by email, and their dashboard is scoped to their brand.
 *
 * `marketing` scoped to brands is the BRAND MARKETER: they see and edit only
 * their brand(s)' content, calendar, campaigns, platforms, WhatsApp flows, and
 * episodes. (CRM contacts/deals are group-wide and gated by the `marketing`
 * grant alone — they carry no brand tag.)
 */
export const BRAND_SCOPED_SECTIONS: SectionDef[] = [
  { key: 'finance', label: 'Finance', href: '/finance' },
  { key: 'inventory', label: 'Inventory', href: '/inventory' },
  { key: 'procurement', label: 'Procurement', href: '/procurement' },
  { key: 'all_tasks', label: 'Task oversight (brand manager)', href: '/tasks' },
  { key: 'marketing', label: 'Marketing (brand marketer)', href: '/mhub/marketing/calendar' },
  { key: 'meetings', label: 'Meetings (view all)', href: '/meetings' },
  { key: 'forms', label: 'Forms (by brand)', href: '/forms' },
  { key: 'duties', label: 'Duties (assign within brand)', href: '/duties' },
  { key: 'duties_all', label: 'Duty oversight (by brand)', href: '/management/duties' },
  { key: 'calendar_team', label: 'Team calendar (by brand)', href: '/calendar' },
  { key: 'people', label: 'People (by brand)', href: '/management/team' },
  { key: 'knowledge', label: 'Knowledge (by brand)', href: '/knowledge' },
  { key: 'historical_imports', label: 'Historical imports (by brand)', href: '/historical-imports' },
]

/** New sensitive surfaces use an explicit record horizon in addition to the
 * module grant. Missing configuration is conservative (`own`); the founding
 * admin is the only implicit cross-group viewer. */
export function recordAccessLevel(
  recordAccess: RecordAccessMap | null,
  section: SectionKey,
): RecordAccessLevel {
  if (recordAccess === null) return 'group'
  return recordAccess[section] ?? 'own'
}

export function recordAccessAtLeast(
  actual: RecordAccessLevel,
  required: RecordAccessLevel,
): boolean {
  const rank: Record<RecordAccessLevel, number> = {
    own: 0,
    department: 1,
    management: 2,
    group: 3,
  }
  return rank[actual] >= rank[required]
}

/**
 * The brand UUIDs a user may touch within a section, or null for no
 * restriction. brandAccess === null → founding admin → unrestricted.
 */
export function allowedBrands(
  brandAccess: BrandAccessMap | null,
  section: SectionKey,
): string[] | null {
  if (brandAccess === null) return null
  const list = brandAccess[section]
  if (!Array.isArray(list) || list.length === 0) return null
  return list
}

/** Section that controls who may manage portal users (admins only by default). */
export const USERS_SECTION: SectionDef = { key: 'users', label: 'Manage portal users', href: '/management/users' }

/**
 * Cross-cutting grant: when set to 'view' (or 'edit'), the user may see EVERY
 * team member's tasks (the "super admin" task view). Unset → a user only ever
 * sees their own assigned tasks. The founding admin always has it implicitly.
 * Deliberately NOT in `inheritedOpsSections` — `ops` access must not imply it.
 */
export const ALL_TASKS_SECTION: SectionDef = { key: 'all_tasks', label: "View all team members' tasks", href: '/tasks' }

/** A blank permissions map with every Ops section set to 'none'. */
export function defaultPermissions(): PermissionsMap {
  return Object.fromEntries(SECTIONS.map((s) => [s.key, 'none'])) as PermissionsMap
}

/**
 * Evaluate whether a permissions map grants a required access level.
 * - permissions === null → founding admin, always true
 * - 'view' requirement   → satisfied by 'view' or 'edit'
 * - 'edit' requirement   → only satisfied by 'edit'
 */
export function can(
  permissions: PermissionsMap | null,
  section: SectionKey,
  level: AccessLevel,
): boolean {
  if (permissions === null) return true // admin
  // Unset module keys fall back to broader grants so existing users keep
  // working. inventory/procurement deliberately have NO fallback — like
  // finance-by-brand, they must be granted explicitly.
  const fallbacks: Partial<Record<SectionKey, SectionKey[]>> = {
    management: ['ops'],
    finance: ['ops'],
    npt_service: ['ops'],
    rayyan_admin: ['ops'],
    rhythms_admin: ['ops'],
    people: ['management'],
    knowledge: ['management'],
    darul_admin: ['ops'],
    nuuranest_admin: ['ops'],
    glitz_admin: ['ops'],
    // meetings intentionally has NO fallback: a manager must be granted
    // `meetings` explicitly to see meetings they are not a participant of.
    // forms fall back to an EXPLICIT `management` grant only (single-level, so
    // ops-only users get nothing) — managers keep forms; everyone else needs an
    // explicit `forms` grant. This is what closes the "all forms to all users" leak.
    forms: ['management'],
    forms_responses: ['management'],
    forms_approvals: ['management'],
    // Duties were manager-only before 055 (the /management/duties page is gated
    // on `management`). These fallbacks keep every existing manager working
    // exactly as before; a non-manager still needs an explicit `duties` grant.
    // NOTE: viewing/completing your OWN duties needs no grant at all — that is
    // handled in dutyCan(), not here.
    duties: ['management'],
    duties_all: ['management'],
    duties_review: ['management'],
    // calendar_team deliberately has NO fallback. calendarPeopleScope() already
    // treats an `all_tasks` grant as sufficient, so managers who can see the
    // tasks can see the calendar rendering of them — but a plain `management`
    // grant must not silently open every colleague's schedule.
  }
  let granted = permissions[section]
  if (granted === undefined) {
    for (const fb of fallbacks[section] ?? []) {
      if (permissions[fb] !== undefined) { granted = permissions[fb]; break }
    }
  }
  granted = granted ?? 'none'
  if (level === 'view') return granted === 'view' || granted === 'edit'
  if (level === 'edit') return granted === 'edit'
  return false
}

/**
 * Whether this user may see every team member's tasks (the "super admin" task
 * scope). True for the founding admin (permissions === null) or anyone granted
 * the `all_tasks` section. Everyone else is scoped to their own assigned tasks.
 */
export function canSeeAllTasks(permissions: PermissionsMap | null): boolean {
  return permissions === null || can(permissions, 'all_tasks', 'view')
}

/**
 * The caller's task visibility scope:
 *   'all'    — founding admin or unrestricted all_tasks grant (whole group)
 *   'brands' — all_tasks restricted to specific brands = BRAND MANAGER: they
 *              see/steer every task within those brands only
 *   'own'    — everyone else: only their own assigned tasks
 */
export type TaskScope =
  | { kind: 'all' }
  | { kind: 'brands'; brandIds: string[] }
  | { kind: 'own' }

export function taskScope(
  permissions: PermissionsMap | null,
  brandAccess: BrandAccessMap | null,
): TaskScope {
  if (!canSeeAllTasks(permissions)) return { kind: 'own' }
  const brandIds = allowedBrands(brandAccess, 'all_tasks')
  return brandIds === null ? { kind: 'all' } : { kind: 'brands', brandIds }
}

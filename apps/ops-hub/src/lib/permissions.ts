import type { SectionKey, AccessLevel, PermissionsMap, BrandAccessMap } from '@ocg/db'

export type { SectionKey, AccessLevel, PermissionsMap, BrandAccessMap }

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
 *   meetings — meeting notes + prep (inherits `management`, then `ops`).
 *   inventory / procurement — stock + purchasing. NO inheritance: like money,
 *     these require an explicit grant.
 * "My Tasks", Chat, and the Forum are always visible to any signed-in user.
 */
export const SECTIONS: SectionDef[] = [
  { key: 'ops',        label: 'Ops',    href: '/' },
  { key: 'management', label: 'Management', href: '/management' },
  { key: 'meetings', label: 'Meetings', href: '/meetings' },
  { key: 'finance', label: 'Finance', href: '/finance' },
  { key: 'inventory', label: 'Inventory', href: '/inventory' },
  { key: 'procurement', label: 'Procurement', href: '/procurement' },
  { key: 'npt_service', label: 'NPT Service', href: '/npt' },
  { key: 'rayyan_admin', label: 'Rayyan Admin', href: '/rayyan' },
  { key: 'rhythms_admin', label: 'Rhythms Admin', href: '/rhythms' },
  { key: 'darul_admin', label: 'Darul Swafa Admin', href: '/darul' },
  { key: 'ops_agents', label: 'Agents', href: '/agents' },
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
 */
export const BRAND_SCOPED_SECTIONS: SectionDef[] = [
  { key: 'finance', label: 'Finance', href: '/finance' },
  { key: 'inventory', label: 'Inventory', href: '/inventory' },
  { key: 'procurement', label: 'Procurement', href: '/procurement' },
  { key: 'all_tasks', label: 'Task oversight (brand manager)', href: '/tasks' },
]

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
    darul_admin: ['ops'],
    meetings: ['management', 'ops'],
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

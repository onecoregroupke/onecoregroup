import type { SectionKey, AccessLevel, PermissionsMap } from '@ocg/db'

export type { SectionKey, AccessLevel, PermissionsMap }

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
 * "My Tasks" is always visible to any signed-in user (it only ever shows
 * that person's own assigned work).
 */
export const SECTIONS: SectionDef[] = [
  { key: 'ops',        label: 'Ops',    href: '/' },
  { key: 'management', label: 'Management', href: '/management' },
  { key: 'finance', label: 'Finance', href: '/finance' },
  { key: 'npt_service', label: 'NPT Service', href: '/npt' },
  { key: 'rayyan_admin', label: 'Rayyan Admin', href: '/rayyan' },
  { key: 'rhythms_admin', label: 'Rhythms Admin', href: '/rhythms' },
  { key: 'darul_admin', label: 'Darul Swafa Admin', href: '/darul' },
  { key: 'ops_agents', label: 'Agents', href: '/agents' },
]

/** Section that controls who may manage portal users (admins only by default). */
export const USERS_SECTION: SectionDef = { key: 'users', label: 'Manage portal users', href: '/management/users' }

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
  const inheritedOpsSections: SectionKey[] = ['management', 'finance', 'npt_service', 'rayyan_admin', 'rhythms_admin', 'darul_admin']
  const granted = permissions[section] ?? (inheritedOpsSections.includes(section) ? permissions.ops : undefined) ?? 'none'
  if (level === 'view') return granted === 'view' || granted === 'edit'
  if (level === 'edit') return granted === 'edit'
  return false
}

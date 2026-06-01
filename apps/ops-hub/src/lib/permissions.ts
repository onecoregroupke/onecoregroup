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
 * "My Tasks" is always visible to any signed-in user (it only ever shows
 * that person's own assigned work).
 */
export const SECTIONS: SectionDef[] = [
  { key: 'ops',        label: 'Ops',    href: '/' },
  { key: 'ops_agents', label: 'Agents', href: '/agents' },
]

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
  const granted = permissions[section] ?? 'none'
  if (level === 'view') return granted === 'view' || granted === 'edit'
  if (level === 'edit') return granted === 'edit'
  return false
}

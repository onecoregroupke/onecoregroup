import type { SectionKey, AccessLevel, PermissionsMap } from '@ocg/db'

export type { SectionKey, AccessLevel, PermissionsMap }

export interface SectionDef {
  key: SectionKey
  label: string
  href: string
}

/** All sections that can have per-user access control */
export const SECTIONS: SectionDef[] = [
  { key: 'dashboard',   label: 'Dashboard',      href: '/' },
  { key: 'input',       label: 'Input Portal',   href: '/input' },
  { key: 'compliance',  label: 'Compliance',     href: '/compliance' },
  { key: 'properties',  label: 'Properties',     href: '/properties' },
  { key: 'glitz',       label: "Glitz N' Glim",  href: '/glitz' },
  { key: 'npt',         label: 'NPT Catalogue',  href: '/npt' },
  { key: 'reports',     label: 'Reports',        href: '/reports' },
  { key: 'marketing',   label: 'Marketing',      href: '/marketing/calendar' },
  { key: 'brands',      label: 'Brands',         href: '/brands' },
  { key: 'users',       label: 'Users',          href: '/users' },
]

/**
 * Evaluate whether a permissions map grants a required access level.
 * - permissions === null  → founding admin, always true
 * - 'view' requirement    → satisfied by 'view' or 'edit'
 * - 'edit' requirement    → only satisfied by 'edit'
 */
export function can(
  permissions: PermissionsMap | null,
  section: SectionKey,
  level: AccessLevel,
): boolean {
  if (permissions === null) return true          // admin
  const granted = permissions[section] ?? 'none'
  if (level === 'view') return granted === 'view' || granted === 'edit'
  if (level === 'edit') return granted === 'edit'
  return false
}

/** Default permissions map for a brand-new invited user (everything none) */
export function defaultPermissions(): PermissionsMap {
  return Object.fromEntries(
    SECTIONS.filter(s => s.key !== 'users').map(s => [s.key, 'none'])
  ) as PermissionsMap
}

'use client'

import { createContext, useContext } from 'react'
import type { SectionKey, AccessLevel, PermissionsMap } from '@/lib/permissions'
import { can as canFn } from '@/lib/permissions'

interface PermissionsContextValue {
  /** null = founding admin with full access */
  permissions: PermissionsMap | null
  isAdmin: boolean
  email: string | null
  displayName: string | null
  can: (section: SectionKey, level: AccessLevel) => boolean
}

export const PermissionsContext = createContext<PermissionsContextValue>({
  permissions: null,
  isAdmin: true,
  email: null,
  displayName: null,
  can: () => true,
})

export function usePermissions() {
  return useContext(PermissionsContext)
}

export function makeContextValue(
  permissions: PermissionsMap | null,
  email: string | null = null,
  displayName: string | null = null,
): PermissionsContextValue {
  return {
    permissions,
    isAdmin: permissions === null,
    email,
    displayName,
    can: (section, level) => canFn(permissions, section, level),
  }
}

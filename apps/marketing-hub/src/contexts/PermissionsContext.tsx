'use client'

import { createContext, useContext } from 'react'
import type { SectionKey, AccessLevel, PermissionsMap } from '@/lib/permissions'
import { can as canFn } from '@/lib/permissions'

interface PermissionsContextValue {
  /** null = founding admin with full access */
  permissions: PermissionsMap | null
  isAdmin: boolean
  can: (section: SectionKey, level: AccessLevel) => boolean
}

export const PermissionsContext = createContext<PermissionsContextValue>({
  permissions: null,
  isAdmin: true,
  can: () => true,
})

export function usePermissions() {
  return useContext(PermissionsContext)
}

export function makeContextValue(permissions: PermissionsMap | null): PermissionsContextValue {
  return {
    permissions,
    isAdmin: permissions === null,
    can: (section, level) => canFn(permissions, section, level),
  }
}

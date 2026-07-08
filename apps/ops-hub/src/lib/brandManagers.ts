import { db } from './serverClient'
import type { PermissionsMap, BrandAccessMap } from '@ocg/db'

export interface BrandManager {
  userId: string
  email: string
  name: string
  brandIds: string[]
}

/**
 * Portal users set up as BRAND MANAGERS: active users granted `all_tasks`
 * restricted to specific brands via brand_access. They receive the per-brand
 * ops report by email and see all their brand's tasks in the hub.
 */
export async function listBrandManagers(): Promise<BrandManager[]> {
  const supabase = db()
  // user_permissions isn't in the generated schema map; cast narrowly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows } = await (supabase as any)
    .from('user_permissions')
    .select('user_id, display_name, permissions, brand_access, is_active') as {
    data: {
      user_id: string
      display_name: string | null
      permissions: PermissionsMap
      brand_access: BrandAccessMap | null
      is_active: boolean
    }[] | null
  }

  const managers = (rows ?? []).filter((r) => {
    if (r.is_active === false) return false
    const grant = r.permissions?.all_tasks
    if (grant !== 'view' && grant !== 'edit') return false
    const brands = r.brand_access?.all_tasks
    return Array.isArray(brands) && brands.length > 0
  })
  if (managers.length === 0) return []

  // Resolve emails from Supabase Auth (user_permissions stores no email).
  const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const emailById = new Map((authData?.users ?? []).map((u) => [u.id, u.email ?? '']))

  return managers
    .map((m) => ({
      userId: m.user_id,
      email: emailById.get(m.user_id) ?? '',
      name: m.display_name ?? emailById.get(m.user_id)?.split('@')[0] ?? '',
      brandIds: m.brand_access!.all_tasks!,
    }))
    .filter((m) => m.email)
}

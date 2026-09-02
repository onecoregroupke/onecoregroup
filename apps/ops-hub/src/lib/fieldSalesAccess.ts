import type { SectionKey, AccessLevel, PermissionsMap, BrandAccessMap, RecordAccessLevel } from '@ocg/db'
import { recordAccessAtLeast } from './permissions'

export interface FieldSalesAccessContext {
  permissions: PermissionsMap | null
  brandAccess: BrandAccessMap | null
  teamMemberId: string | null
  can: (section: SectionKey, level?: AccessLevel) => boolean
  recordScope: (section: SectionKey) => RecordAccessLevel
  allowedBrandIds: (section: SectionKey) => string[] | null
}

export function isFieldSalesManager(actor: FieldSalesAccessContext): boolean {
  return actor.permissions === null
    || actor.can('inventory', 'view')
    || recordAccessAtLeast(actor.recordScope('field_sales'), 'management')
}

export function canManageFieldSales(actor: FieldSalesAccessContext): boolean {
  return actor.permissions === null
    || actor.can('inventory', 'edit')
    || (actor.can('field_sales', 'edit')
      && recordAccessAtLeast(actor.recordScope('field_sales'), 'management'))
}

export function fieldSalesAllowedBrands(actor: FieldSalesAccessContext): string[] | null {
  const explicit = actor.brandAccess?.field_sales
  if (Array.isArray(explicit) && explicit.length > 0) return explicit
  return actor.can('inventory', 'view')
    ? actor.allowedBrandIds('inventory')
    : actor.allowedBrandIds('field_sales')
}

export function canAccessSalesperson(actor: FieldSalesAccessContext, salespersonId: string | null): boolean {
  return isFieldSalesManager(actor)
    || (actor.teamMemberId !== null && salespersonId === actor.teamMemberId)
}

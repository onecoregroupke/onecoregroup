// Procurement item classification + disposition (§20). Pure + unit-tested.
// The operationally-simple question — "store & issue later, or consumed now?" —
// determines whether receiving a line creates an inventory balance.

export const PROCUREMENT_ITEM_TYPES = [
  { value: 'stocked_inventory', label: 'Stocked inventory', defaultDisposition: 'stock' },
  { value: 'consumable', label: 'Consumable inventory', defaultDisposition: 'stock' },
  { value: 'immediate_expense', label: 'Immediate expense (used now)', defaultDisposition: 'consume' },
  { value: 'fixed_asset', label: 'Fixed asset', defaultDisposition: 'stock' },
  { value: 'service', label: 'Service', defaultDisposition: 'consume' },
  { value: 'resale', label: 'Resale item', defaultDisposition: 'stock' },
  { value: 'student_meal', label: 'Student meal / programme supply', defaultDisposition: 'consume' },
  { value: 'staff_welfare', label: 'Staff welfare (refreshments)', defaultDisposition: 'consume' },
  { value: 'facilities', label: 'Facilities / cleaning supply', defaultDisposition: 'stock' },
  { value: 'other', label: 'Other', defaultDisposition: 'consume' },
] as const

export type ProcurementItemType = (typeof PROCUREMENT_ITEM_TYPES)[number]['value']

export const PROCUREMENT_SCOPES = [
  { value: 'brand', label: 'This brand only' },
  { value: 'group_shared', label: 'Group shared (all brands)' },
  { value: 'shared_selected', label: 'Shared between selected brands' },
] as const

export const COST_CENTRES = [
  'Student Meals', 'Staff Welfare', 'Facilities', 'Operations', 'Marketing', 'Repairs', 'Utilities', 'Other',
] as const

/** The sensible default disposition for an item type. */
export function defaultDisposition(itemType: string): 'stock' | 'consume' {
  const def = PROCUREMENT_ITEM_TYPES.find((t) => t.value === itemType)?.defaultDisposition
  return def === 'stock' ? 'stock' : 'consume'
}

/**
 * Whether receiving this line should create/increase an inventory balance.
 * Only lines explicitly stored ('stock' disposition) are stocked; immediate
 * consumption, services, meals, and welfare are expensed with NO stock — the fix
 * for "do not force immediate-consumption purchases into stock inventory".
 */
export function shouldStock(disposition: string): boolean {
  return disposition === 'stock'
}

export function itemTypeLabel(itemType: string): string {
  return PROCUREMENT_ITEM_TYPES.find((t) => t.value === itemType)?.label ?? itemType
}

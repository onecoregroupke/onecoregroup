import type { InventoryItemRow, InventoryPriceHistoryRow } from '@ocg/db'

export const MANAGEMENT_PRODUCT_FAMILIES = [
  'Multi Surface Cleaner',
  'Dishwashing Liquid',
  'Fabric Softener',
  'Handwash',
  'Toilet Cleaner',
  'Bleach',
  'Glass Cleaner',
  'Shower Gel',
  'Multipurpose Cleaner',
  'Shampoo',
  'Hand Sanitizer Gel',
  'Hand Sanitizer Mist',
  'General / Shared',
] as const

const FAMILY_ORDER = new Map(MANAGEMENT_PRODUCT_FAMILIES.map((family, index) => [normalizeKey(family), index + 1]))

export function normalizeDisplayNomenclature(value: string): string {
  return value
    .replace(/\b5OO\s*ML\b/gi, '500ML')
    .replace(/\b2O\s*(?:LTRS?|LITRES?)\b/gi, '20LTRS')
    .replace(/\s+/g, ' ')
    .trim()
}

export function physicalSizeMl(item: Pick<InventoryItemRow, 'size_ml' | 'size_label' | 'package_config' | 'name' | 'canonical_name'>): number {
  if (Number(item.size_ml) > 0) return Number(item.size_ml)
  const identity = [item.size_label, item.package_config, item.canonical_name, item.name].join(' ')
  const match = identity.match(/\b(\d+(?:\.\d+)?)\s*(ml|l|ltr|ltrs|litre|litres)\b/i)
  if (!match) return Number.MAX_SAFE_INTEGER
  const value = Number(match[1])
  return /^ml$/i.test(match[2]!) ? value : value * 1000
}

export function familyOrder(family: string): number {
  if (!family.trim()) return FAMILY_ORDER.get(normalizeKey('General / Shared'))!
  return FAMILY_ORDER.get(normalizeKey(family)) ?? 10_000
}

export function compareInventoryItems(a: InventoryItemRow, b: InventoryItemRow): number {
  const type = typeOrder(a.item_type) - typeOrder(b.item_type)
  if (type) return type
  const family = familyOrder(a.product_family) - familyOrder(b.product_family)
  if (family) return family
  const explicit = Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)
  if (explicit) return explicit
  const size = physicalSizeMl(a) - physicalSizeMl(b)
  if (size) return size
  const component = componentOrder(a.packaging_component || a.packaging_role) - componentOrder(b.packaging_component || b.packaging_role)
  if (component) return component
  return normalizeDisplayNomenclature(a.display_name || a.name).localeCompare(normalizeDisplayNomenclature(b.display_name || b.name))
}

export function monthPrice(
  history: readonly InventoryPriceHistoryRow[],
  priceType: InventoryPriceHistoryRow['price_type'],
  month: string,
): InventoryPriceHistoryRow | null {
  const endExclusive = nextMonth(month)
  return history
    .filter((row) => row.price_type === priceType && row.effective_date < endExclusive)
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date) || b.created_at.localeCompare(a.created_at))[0] ?? null
}

export function trailingMonths(asOf: string, count = 3): string[] {
  const date = new Date(`${asOf.slice(0, 7)}-01T00:00:00Z`)
  return Array.from({ length: count }, (_, offset) => {
    const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - (count - 1 - offset), 1))
    return value.toISOString().slice(0, 7)
  })
}

function nextMonth(month: string): string {
  const [year, value] = month.split('-').map(Number)
  return new Date(Date.UTC(year!, value!, 1)).toISOString().slice(0, 7)
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function typeOrder(value: string): number {
  return ['raw_material', 'packaging', 'work_in_progress', 'finished_good'].indexOf(value) + 1 || 99
}

function componentOrder(value: string): number {
  const normalized = value.toLowerCase()
  if (/bottle|container/.test(normalized)) return 1
  if (/closure|cork|cap|pump|trigger|spray|top|inserter/.test(normalized)) return 2
  if (/front/.test(normalized)) return 3
  if (/back/.test(normalized)) return 4
  return 5
}

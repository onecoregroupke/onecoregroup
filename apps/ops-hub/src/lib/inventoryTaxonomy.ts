import type { InventoryItemRow } from '@ocg/db'

export type InventoryTaxonomyItem = Pick<
  InventoryItemRow,
  | 'id' | 'name' | 'canonical_name' | 'sku' | 'item_type' | 'category'
  | 'product_family' | 'size_label' | 'package_config' | 'base_unit'
  | 'unit' | 'pack_size' | 'store_id' | 'packaging_role'
>

export interface InventoryTaxonomy {
  section: string
  sectionKey: string
  category: string
  categoryKey: string
  subcategory: string
  subcategoryKey: string
  family: string
  size: string
  packageConfiguration: string
  packagingRole: string
  searchText: string
}

export interface InventoryTaxonomyFilter {
  category?: string
  subcategory?: string
  family?: string
  pack?: string
}

export interface TaxonomyOption {
  value: string
  label: string
  count: number
}

const UNCLASSIFIED = 'Other / Unclassified'

export const PACKAGING_CATEGORY_LABELS: Record<string, string> = {
  bottles: 'Bottles / Containers',
  closures: 'Closures & Corks',
  stickers: 'Stickers / Labels',
  unclassified: UNCLASSIFIED,
}

export const PACKAGING_ROLE_LABELS: Record<string, string> = {
  bottle: 'Bottles',
  cap: 'Caps',
  cork: 'Corks',
  inserter: 'Inserters',
  pump: 'Pumps',
  trigger_pump: 'Trigger Pumps',
  spray: 'Sprays',
  flip_top: 'Flip Tops',
  clip_top: 'Clip Tops',
  front_label: 'Front',
  back_label: 'Back',
  cap_inserter_set: 'Cap + Inserter Sets',
  other_packaging: UNCLASSIFIED,
  '': UNCLASSIFIED,
}

function key(value: string): string {
  return value.trim().toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unclassified'
}

function sectionFor(itemType: string): { label: string; key: string } {
  if (itemType === 'packaging') return { label: 'Packaging', key: 'packaging' }
  if (itemType === 'finished_good') return { label: 'Finished Goods', key: 'finished-goods' }
  if (itemType === 'raw_material') return { label: 'Raw Materials', key: 'raw-materials' }
  if (itemType === 'work_in_progress') return { label: 'Production / WIP', key: 'work-in-progress' }
  return { label: itemType ? itemType.replace(/_/g, ' ') : UNCLASSIFIED, key: key(itemType) }
}

function packagingCategory(category: string): string {
  const value = category.toLowerCase()
  if (value.includes('bottle') || value.includes('container')) return 'bottles'
  if (value.includes('closure') || value.includes('cork') || value.includes('cap')) return 'closures'
  if (value.includes('sticker') || value.includes('label')) return 'stickers'
  return 'unclassified'
}

/**
 * Compatibility fallback for records created before migration 071. Current
 * Iceland rows are backfilled once into inventory_items.packaging_role; future
 * unknowns remain visible as Other / Unclassified instead of disappearing.
 */
export function inferPackagingRole(item: Pick<InventoryTaxonomyItem, 'name' | 'canonical_name' | 'category' | 'packaging_role'>): string {
  if (item.packaging_role) return item.packaging_role
  const categoryKey = packagingCategory(item.category || '')
  const value = `${item.canonical_name || ''} ${item.name || ''}`.toLowerCase()
  if (categoryKey === 'bottles') return 'bottle'
  if (categoryKey === 'stickers') {
    if (/\bsticker\s+front\b|\bfront\s+(sticker|label)\b/.test(value)) return 'front_label'
    if (/\bsticker\s+back\b|\bback\s+(sticker|label)\b/.test(value)) return 'back_label'
    return 'other_packaging'
  }
  if (categoryKey !== 'closures') return ''
  if (/caps?\s*&\s*inserters?/.test(value)) return 'cap_inserter_set'
  if (/trigger\s*pumps?/.test(value)) return 'trigger_pump'
  if (/flip\s*top/.test(value)) return 'flip_top'
  if (/clip\s*top/.test(value)) return 'clip_top'
  if (/inserters?/.test(value)) return 'inserter'
  if (/pumps?/.test(value)) return 'pump'
  if (/sprays?/.test(value)) return 'spray'
  if (/corks?/.test(value)) return 'cork'
  if (/caps?/.test(value)) return 'cap'
  return 'other_packaging'
}

function capacityFromIdentity(value: string): string {
  const match = value.match(/\b(\d+(?:\.\d+)?)\s*(ml|l|ltr|ltrs|lrs|litres?)\b/i)
  if (!match) return ''
  const unit = match[2]!.toLowerCase()
  return `${match[1]}${unit === 'ml' ? 'ml' : 'L'}`
}

export function inventoryTaxonomy(item: InventoryTaxonomyItem): InventoryTaxonomy {
  const section = sectionFor(item.item_type || '')
  let category = item.category || UNCLASSIFIED
  let categoryKey = key(category)
  let subcategory = ''
  let subcategoryKey = ''
  const role = item.item_type === 'packaging' ? inferPackagingRole(item) : ''

  if (item.item_type === 'packaging') {
    categoryKey = packagingCategory(item.category || '')
    category = PACKAGING_CATEGORY_LABELS[categoryKey] ?? UNCLASSIFIED
    if (categoryKey === 'bottles') {
      subcategory = item.size_label || capacityFromIdentity(item.package_config || item.canonical_name || item.name) || UNCLASSIFIED
    } else {
      subcategory = PACKAGING_ROLE_LABELS[role] ?? UNCLASSIFIED
    }
    subcategoryKey = key(subcategory)
  } else if (item.item_type === 'finished_good') {
    category = 'Finished Goods'
    categoryKey = 'finished-goods'
  } else {
    subcategory = item.product_family || ''
    subcategoryKey = key(subcategory)
  }

  const family = item.product_family || ''
  const packageConfiguration = item.package_config || ''
  const size = packageConfiguration || item.size_label || ''

  return {
    section: section.label,
    sectionKey: section.key,
    category,
    categoryKey,
    subcategory,
    subcategoryKey,
    family,
    size,
    packageConfiguration,
    packagingRole: role,
    searchText: [
      item.name, item.canonical_name, item.sku, item.category, category, subcategory,
      family, item.size_label, packageConfiguration, role,
    ].join(' ').toLowerCase(),
  }
}

export function filterInventoryByTaxonomy<T extends InventoryTaxonomyItem>(
  items: T[],
  filter: InventoryTaxonomyFilter,
): T[] {
  return items.filter((item) => {
    const taxonomy = inventoryTaxonomy(item)
    return (!filter.category || taxonomy.categoryKey === filter.category)
      && (!filter.subcategory || taxonomy.subcategoryKey === filter.subcategory)
      && (!filter.family || taxonomy.family === filter.family)
      && (!filter.pack || taxonomy.size === filter.pack)
  })
}

function options(values: Array<{ value: string; label: string }>): TaxonomyOption[] {
  const grouped = new Map<string, TaxonomyOption>()
  for (const value of values) {
    if (!value.value) continue
    const existing = grouped.get(value.value)
    if (existing) existing.count += 1
    else grouped.set(value.value, { ...value, count: 1 })
  }
  return [...grouped.values()].sort((a, b) => a.label.localeCompare(b.label))
}

/** Cascading options: every level is constrained only by levels above it. */
export function inventoryTaxonomyOptions<T extends InventoryTaxonomyItem>(items: T[], filter: InventoryTaxonomyFilter) {
  const categories = options(items.map((item) => {
    const t = inventoryTaxonomy(item)
    return { value: t.categoryKey, label: t.category }
  }))
  const afterCategory = filterInventoryByTaxonomy(items, { category: filter.category })
  const subcategories = options(afterCategory.map((item) => {
    const t = inventoryTaxonomy(item)
    return { value: t.subcategoryKey, label: t.subcategory }
  }))
  const afterSubcategory = filterInventoryByTaxonomy(afterCategory, { subcategory: filter.subcategory })
  const families = options(afterSubcategory.map((item) => {
    const family = inventoryTaxonomy(item).family
    return { value: family, label: family }
  }))
  const afterFamily = filterInventoryByTaxonomy(afterSubcategory, { family: filter.family })
  const packs = options(afterFamily.map((item) => {
    const size = inventoryTaxonomy(item).size
    return { value: size, label: size }
  }))
  return { categories, subcategories, families, packs }
}

export function inventoryBreadcrumb(item: InventoryTaxonomyItem): string {
  const taxonomy = inventoryTaxonomy(item)
  const parts = [taxonomy.section]
  if (taxonomy.category && taxonomy.category !== taxonomy.section) parts.push(taxonomy.category)
  if (taxonomy.subcategory) parts.push(taxonomy.subcategory)
  if (taxonomy.family && !parts.includes(taxonomy.family)) parts.push(taxonomy.family)
  if (taxonomy.size) parts.push(taxonomy.size)
  return parts.join(' › ')
}

import type { InventoryItemRow, InventoryStoreRow, ProductionBomLineRow } from '@ocg/db'
import { inventoryTaxonomy } from './inventoryTaxonomy'
import { packSizeFromConfiguration } from './finishedGoodsQuantity'

export interface InventoryHealthReport {
  packaging: Record<string, { itemCount: number; quantity: number; unit: string | null }>
  problems: {
    noCategory: string[]
    incompatibleCategory: string[]
    finishedWithoutFamily: string[]
    finishedWithoutPackage: string[]
    invalidPackSize: string[]
    legacyFourByFiveLitre: string[]
    packagingWithoutRole: string[]
    stickerWithoutSide: string[]
    missingStore: string[]
    wrongStore: string[]
    finishedWithoutClosure: string[]
    unusedClosures: string[]
    inactiveMappings: string[]
    missingMappingSources: string[]
    emptyAlternativeGroups: string[]
    multipleMandatoryClosures: string[]
    duplicateMappings: string[]
    duplicateClosureNames: string[]
  }
}

function compatibleUnit(items: InventoryItemRow[]): string | null {
  const units = new Set(items.map((item) => item.base_unit || item.unit).filter(Boolean))
  return units.size === 1 ? [...units][0]! : null
}

function simplifiedName(name: string): string {
  return name.toLowerCase().replace(/^closure\s*-\s*/, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

export function inventoryHealthReport(
  items: InventoryItemRow[],
  stores: InventoryStoreRow[],
  bomLines: ProductionBomLineRow[] = [],
): InventoryHealthReport {
  const itemById = new Map(items.map((item) => [item.id, item]))
  const storeById = new Map(stores.map((store) => [store.id, store]))
  const packaging = items.filter((item) => item.item_type === 'packaging')
  const finished = items.filter((item) => item.item_type === 'finished_good')
  const closureItems = packaging.filter((item) => inventoryTaxonomy(item).categoryKey === 'closures')
  const packagingSummary: InventoryHealthReport['packaging'] = {}
  for (const category of ['bottles', 'closures', 'stickers', 'unclassified']) {
    const rows = packaging.filter((item) => inventoryTaxonomy(item).categoryKey === category)
    const unit = compatibleUnit(rows)
    packagingSummary[category] = {
      itemCount: rows.length,
      quantity: unit ? rows.reduce((sum, item) => sum + Number(item.quantity || 0), 0) : 0,
      unit,
    }
  }

  const mappedComponents = new Set(bomLines.filter((line) => line.active).map((line) => line.component_item_id))
  const closureMappingsByProduct = new Map<string, ProductionBomLineRow[]>()
  for (const line of bomLines.filter((candidate) => candidate.active)) {
    const component = itemById.get(line.component_item_id)
    if (component && inventoryTaxonomy(component).categoryKey === 'closures') {
      closureMappingsByProduct.set(line.product_item_id, [...(closureMappingsByProduct.get(line.product_item_id) ?? []), line])
    }
  }

  const activeBomGroups = new Map<string, ProductionBomLineRow[]>()
  const duplicateMappingKeys = new Map<string, ProductionBomLineRow[]>()
  for (const line of bomLines.filter((candidate) => candidate.active)) {
    const groupKey = `${line.product_item_id}:${line.requirement_group || line.id}`
    activeBomGroups.set(groupKey, [...(activeBomGroups.get(groupKey) ?? []), line])
    const mappingKey = `${line.product_item_id}:${line.component_item_id}`
    duplicateMappingKeys.set(mappingKey, [...(duplicateMappingKeys.get(mappingKey) ?? []), line])
  }

  const duplicateGroups = new Map<string, string[]>()
  for (const closure of closureItems) {
    const name = simplifiedName(closure.canonical_name || closure.name)
    duplicateGroups.set(name, [...(duplicateGroups.get(name) ?? []), closure.name])
  }

  return {
    packaging: packagingSummary,
    problems: {
      noCategory: items.filter((item) => !item.category).map((item) => item.name),
      incompatibleCategory: items.filter((item) => item.category.startsWith('Packaging -') && item.item_type !== 'packaging').map((item) => item.name),
      finishedWithoutFamily: finished.filter((item) => !item.product_family).map((item) => item.name),
      finishedWithoutPackage: finished.filter((item) => !packSizeFromConfiguration(item.package_config)).map((item) => item.name),
      invalidPackSize: finished.filter((item) => {
        const expected = packSizeFromConfiguration(item.package_config)
        return expected != null && Number(item.pack_size) !== expected
      }).map((item) => item.name),
      legacyFourByFiveLitre: finished.filter((item) => /^4\s*[x×]\s*5\s*l/i.test(item.package_config)).map((item) => item.name),
      packagingWithoutRole: packaging.filter((item) => !item.packaging_role).map((item) => item.name),
      stickerWithoutSide: packaging.filter((item) => {
        const t = inventoryTaxonomy(item)
        return t.categoryKey === 'stickers' && !['front_label', 'back_label'].includes(t.packagingRole)
      }).map((item) => item.name),
      missingStore: packaging.filter((item) => !item.store_id).map((item) => item.name),
      wrongStore: items.filter((item) => {
        if (!item.store_id) return false
        const store = storeById.get(item.store_id)
        if (!store) return true
        if (item.item_type === 'packaging') return store.store_type !== 'packaging'
        if (item.item_type === 'finished_good') return store.store_type !== 'finished_goods'
        if (item.item_type === 'raw_material') return store.store_type !== 'raw'
        return false
      }).map((item) => item.name),
      finishedWithoutClosure: finished.filter((item) => !closureMappingsByProduct.has(item.id)).map((item) => item.name),
      unusedClosures: closureItems.filter((item) => !mappedComponents.has(item.id)).map((item) => item.name),
      inactiveMappings: bomLines.filter((line) => line.active && itemById.has(line.component_item_id)
          && !itemById.get(line.component_item_id)?.is_active)
        .map((line) => line.id),
      missingMappingSources: bomLines.filter((line) => line.active && !itemById.has(line.component_item_id))
        .map((line) => line.id),
      emptyAlternativeGroups: [...activeBomGroups.entries()]
        .filter(([, lines]) => lines.some((line) => line.selection_mode === 'one_of')
          && !lines.some((line) => itemById.get(line.component_item_id)?.is_active))
        .map(([key]) => key),
      multipleMandatoryClosures: [...activeBomGroups.entries()]
        .filter(([, lines]) => lines.length > 1 && lines.every((line) => line.selection_mode !== 'one_of')
          && lines.every((line) => {
            const component = itemById.get(line.component_item_id)
            return component && inventoryTaxonomy(component).categoryKey === 'closures'
          }))
        .map(([key]) => key),
      duplicateMappings: [...duplicateMappingKeys.entries()].filter(([, lines]) => lines.length > 1)
        .map(([key]) => key),
      duplicateClosureNames: [...duplicateGroups.values()].filter((names) => names.length > 1).flat(),
    },
  }
}

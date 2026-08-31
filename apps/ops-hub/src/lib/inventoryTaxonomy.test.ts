import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  filterInventoryByTaxonomy,
  inventoryTaxonomy,
  inventoryTaxonomyOptions,
  parseInventoryClassifications,
  serializeInventoryClassifications,
  toggleInventoryClassification,
} from './inventoryTaxonomy'

function item(overrides: Record<string, unknown>) {
  return {
    id: String(overrides.id ?? overrides.name), name: '', canonical_name: '', sku: '', item_type: 'packaging',
    category: '', product_family: '', size_label: '', package_config: '', base_unit: 'pcs', unit: 'pcs',
    pack_size: 1, store_id: 'packaging-store', packaging_role: '', ...overrides,
  }
}

test('closure taxonomy distinguishes caps, corks and trigger pumps', () => {
  const caps = inventoryTaxonomy(item({ name: 'Closure - white caps', category: 'Packaging - Closures' }))
  const corks = inventoryTaxonomy(item({ name: 'Closure - blue corks', category: 'Packaging - Closures' }))
  const pumps = inventoryTaxonomy(item({ name: 'Closure - white trigger pumps', category: 'Packaging - Closures' }))
  assert.deepEqual([caps.section, caps.category, caps.subcategory], ['Packaging', 'Closures & Corks', 'Caps'])
  assert.equal(corks.subcategory, 'Corks')
  assert.equal(pumps.subcategory, 'Trigger Pumps')
})

test('front and back stickers remain separate physical taxonomy items', () => {
  const front = item({ id: 'front', name: 'Sticker Front - Fabric Softener - 12x500ml', category: 'Packaging - Stickers', product_family: 'Fabric Softener', package_config: '12x500ml' })
  const back = item({ id: 'back', name: 'Sticker Back - Fabric Softener - 12x500ml', category: 'Packaging - Stickers', product_family: 'Fabric Softener', package_config: '12x500ml' })
  assert.equal(inventoryTaxonomy(front).subcategory, 'Front')
  assert.equal(inventoryTaxonomy(back).subcategory, 'Back')
  assert.notEqual(front.id, back.id)
})

test('finished goods use product family and package metadata', () => {
  const bleach = inventoryTaxonomy(item({ name: 'Bleach - 12x1ltr', item_type: 'finished_good', category: 'Finished Goods', product_family: 'Bleach', package_config: '12x1ltr', pack_size: 12 }))
  const toilet = inventoryTaxonomy(item({ name: 'Hawaiian Toilet Cleaner - 12x750ml', item_type: 'finished_good', category: 'Finished Goods', product_family: 'Hawaiian Toilet Cleaner', package_config: '12x750ml', pack_size: 12 }))
  assert.deepEqual([bleach.section, bleach.family, bleach.size], ['Finished Goods', 'Bleach', '12x1ltr'])
  assert.deepEqual([toilet.section, toilet.family, toilet.size], ['Finished Goods', 'Hawaiian Toilet Cleaner', '12x750ml'])
})

test('unknown categories stay visible under Other / Unclassified', () => {
  const unknown = inventoryTaxonomy(item({ name: 'Mystery wrap', category: '' }))
  assert.equal(unknown.category, 'Other / Unclassified')
})

test('taxonomy filters cascade and both stock-card/manufacturing consumers resolve identically', () => {
  const rows = [
    item({ id: 'front', name: 'Sticker Front - Fabric Softener - 12x500ml', category: 'Packaging - Stickers', packaging_role: 'front_label', product_family: 'Fabric Softener', package_config: '12x500ml' }),
    item({ id: 'back', name: 'Sticker Back - Fabric Softener - 12x500ml', category: 'Packaging - Stickers', packaging_role: 'back_label', product_family: 'Fabric Softener', package_config: '12x500ml' }),
    item({ id: 'cap', name: 'Closure - white caps', category: 'Packaging - Closures', packaging_role: 'cap' }),
  ]
  const opts = inventoryTaxonomyOptions(rows, { category: 'stickers', subcategory: 'front' })
  assert.deepEqual(opts.subcategories.map((o) => o.label), ['Back', 'Front'])
  assert.deepEqual(opts.families.map((o) => o.label), ['Fabric Softener'])
  const filtered = filterInventoryByTaxonomy(rows, { category: 'stickers', subcategory: 'front' })
  assert.deepEqual(filtered.map((r) => r.id), ['front'])
  assert.deepEqual(inventoryTaxonomy(filtered[0]!), inventoryTaxonomy(rows[0]!))
})

test('no selected classifications returns every inventory item', () => {
  const rows = [
    item({ id: 'raw', item_type: 'raw_material', category: 'Raw Materials' }),
    item({ id: 'perfume', item_type: 'raw_material', category: 'Perfume' }),
  ]
  assert.deepEqual(filterInventoryByTaxonomy(rows, { categories: [] }).map((row) => row.id), ['raw', 'perfume'])
})

test('one classification filters the stock register', () => {
  const rows = [
    item({ id: 'raw', item_type: 'raw_material', category: 'Raw Materials' }),
    item({ id: 'perfume', item_type: 'raw_material', category: 'Perfume' }),
  ]
  assert.deepEqual(filterInventoryByTaxonomy(rows, { categories: ['perfume'] }).map((row) => row.id), ['perfume'])
})

test('multiple classifications use OR semantics', () => {
  const rows = [
    item({ id: 'raw', item_type: 'raw_material', category: 'Raw Materials' }),
    item({ id: 'perfume', item_type: 'raw_material', category: 'Perfume' }),
    item({ id: 'bottle', item_type: 'packaging', category: 'Packaging - Bottles' }),
  ]
  assert.deepEqual(
    filterInventoryByTaxonomy(rows, { categories: ['raw-materials', 'perfume'] }).map((row) => row.id),
    ['raw', 'perfume'],
  )
})

test('unclassified is selectable and uses one stable key', () => {
  const rows = [
    item({ id: 'unknown-raw', item_type: 'raw_material', category: '' }),
    item({ id: 'unknown-pack', item_type: 'packaging', category: '' }),
    item({ id: 'known', item_type: 'raw_material', category: 'Raw Materials' }),
  ]
  assert.deepEqual(
    filterInventoryByTaxonomy(rows, { categories: ['unclassified'] }).map((row) => row.id),
    ['unknown-raw', 'unknown-pack'],
  )
})

test('classification selection can be deselected and cleared', () => {
  assert.deepEqual(toggleInventoryClassification(['raw-materials', 'perfume'], 'perfume'), ['raw-materials'])
  assert.deepEqual(toggleInventoryClassification(['raw-materials'], 'packaging'), ['raw-materials', 'packaging'])
  assert.deepEqual(toggleInventoryClassification(['raw-materials'], 'raw-materials'), [])
  assert.equal(serializeInventoryClassifications([]), '')
})

test('classification URL state parses, deduplicates and serializes', () => {
  assert.deepEqual(
    parseInventoryClassifications('raw-materials,perfume,raw-materials'),
    ['raw-materials', 'perfume'],
  )
  assert.deepEqual(parseInventoryClassifications(['packaging', 'unclassified']), ['packaging', 'unclassified'])
  assert.equal(serializeInventoryClassifications(['raw-materials', 'perfume']), 'raw-materials,perfume')
  assert.deepEqual(parseInventoryClassifications('raw-materials,../bad, perfume'), ['raw-materials', 'perfume'])
})

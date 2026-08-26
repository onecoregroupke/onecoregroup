import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inventoryHealthReport } from './inventoryHealth'

test('packaging health preserves category counts and compatible piece totals', () => {
  const rows = [
    { id: 'cap', name: 'Closure - white caps', canonical_name: 'Closure - white caps', item_type: 'packaging', category: 'Packaging - Closures', packaging_role: 'cap', quantity: 4881 },
    { id: 'front', name: 'Sticker Front - Fabric Softener - 12x500ml', canonical_name: '', item_type: 'packaging', category: 'Packaging - Stickers', packaging_role: 'front_label', quantity: 3364 },
    { id: 'back', name: 'Sticker Back - Fabric Softener - 12x500ml', canonical_name: '', item_type: 'packaging', category: 'Packaging - Stickers', packaging_role: 'back_label', quantity: 3418 },
  ].map((row) => ({
    brand_id: 'brand', sku: '', unit: 'pcs', base_unit: 'pcs', product_family: 'Fabric Softener',
    size_label: '', package_config: '12x500ml', pack_size: 1, store_id: 'pkg', is_active: true,
    ...row,
  }))
  const report = inventoryHealthReport(rows as never, [{ id: 'pkg', store_type: 'packaging' }] as never)
  assert.deepEqual(report.packaging.closures, { itemCount: 1, quantity: 4881, unit: 'pcs' })
  assert.deepEqual(report.packaging.stickers, { itemCount: 2, quantity: 6782, unit: 'pcs' })
  assert.deepEqual(report.problems.stickerWithoutSide, [])
})

test('invalid and legacy pack metadata is surfaced, never silently corrected', () => {
  const finished = [{
    id: 'fg', brand_id: 'brand', name: 'Legacy 5L', canonical_name: 'Legacy 5L', sku: '',
    item_type: 'finished_good', category: 'Finished Goods', packaging_role: '', product_family: 'Legacy',
    size_label: '5L', package_config: '4x5ltrs', pack_size: 1, store_id: 'fg-store', is_active: true,
    unit: 'pcs', base_unit: 'pcs', quantity: 4,
  }]
  const stores = [{ id: 'fg-store', store_type: 'finished_goods' }]
  const report = inventoryHealthReport(finished as never, stores as never)
  assert.deepEqual(report.problems.invalidPackSize, ['Legacy 5L'])
  assert.deepEqual(report.problems.legacyFourByFiveLitre, ['Legacy 5L'])
})

test('BOM diagnostics flag broken alternatives and repeated mandatory closure mappings', () => {
  const items = [
    { id: 'fg', name: 'Finished', canonical_name: 'Finished', item_type: 'finished_good', category: 'Finished Goods', store_id: 'fg-store', is_active: true },
    { id: 'cap-a', name: 'Closure - A', canonical_name: 'Closure - A', item_type: 'packaging', category: 'Packaging - Closures', packaging_role: 'cap', store_id: 'pkg-store', is_active: true },
    { id: 'cap-b', name: 'Closure - B', canonical_name: 'Closure - B', item_type: 'packaging', category: 'Packaging - Closures', packaging_role: 'cap', store_id: 'pkg-store', is_active: true },
    { id: 'cap-off', name: 'Closure - inactive', canonical_name: 'Closure - inactive', item_type: 'packaging', category: 'Packaging - Closures', packaging_role: 'cap', store_id: 'pkg-store', is_active: false },
  ].map((row) => ({ brand_id: 'brand', sku: '', unit: 'pcs', base_unit: 'pcs', product_family: '', size_label: '', package_config: '', pack_size: 1, quantity: 0, ...row }))
  const lines = [
    { id: 'a', product_item_id: 'fg', component_item_id: 'cap-a', requirement_group: 'mandatory', selection_mode: 'all_required', active: true },
    { id: 'b', product_item_id: 'fg', component_item_id: 'cap-b', requirement_group: 'mandatory', selection_mode: 'all_required', active: true },
    { id: 'off', product_item_id: 'fg', component_item_id: 'cap-off', requirement_group: 'alternatives', selection_mode: 'one_of', active: true },
    { id: 'missing', product_item_id: 'fg', component_item_id: 'missing', requirement_group: 'missing-source', selection_mode: 'all_required', active: true },
  ]
  const report = inventoryHealthReport(items as never, [
    { id: 'fg-store', store_type: 'finished_goods' },
    { id: 'pkg-store', store_type: 'packaging' },
  ] as never, lines as never)
  assert.deepEqual(report.problems.multipleMandatoryClosures, ['fg:mandatory'])
  assert.deepEqual(report.problems.emptyAlternativeGroups, ['fg:alternatives'])
  assert.deepEqual(report.problems.missingMappingSources, ['missing'])
})

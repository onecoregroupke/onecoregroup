import assert from 'node:assert/strict'
import test from 'node:test'
import type { InventoryItemRow, InventoryPriceHistoryRow } from '@ocg/db'
import {
  compareInventoryItems,
  monthPrice,
  normalizeDisplayNomenclature,
  physicalSizeMl,
  trailingMonths,
} from './inventoryPresentation'

const item = (name: string, family: string, size: string, component = '') => ({
  name, display_name: '', canonical_name: name, product_family: family,
  size_label: size, package_config: '', size_ml: null, item_type: 'packaging',
  sort_order: 0, packaging_component: component, packaging_role: component,
}) as InventoryItemRow

test('normalizes only obvious display typography', () => {
  assert.equal(normalizeDisplayNomenclature('Bottle 5OOML'), 'Bottle 500ML')
  assert.equal(normalizeDisplayNomenclature('Bottle 2OLTRS'), 'Bottle 20LTRS')
})

test('sorts management families, physical sizes, then packaging components', () => {
  const rows = [
    item('Back', 'Dishwashing Liquid', '1L', 'back_label'),
    item('Bottle', 'Multi Surface Cleaner', '500ml', 'bottle'),
    item('Front', 'Dishwashing Liquid', '1L', 'front_label'),
    item('Small', 'Multi Surface Cleaner', '250ml', 'bottle'),
  ].sort(compareInventoryItems)
  assert.deepEqual(rows.map((row) => row.name), ['Small', 'Bottle', 'Front', 'Back'])
  assert.equal(physicalSizeMl(item('Twenty', 'Bleach', '20LTRS')), 20_000)
})

test('monthly price carries the latest real evidence forward without fabricating a row', () => {
  const history = [
    { id: 'aug', price_type: 'supplier_reference_cost', amount_ksh: 675, effective_date: '2026-08-01', created_at: '2026-08-01T00:00:00Z' },
    { id: 'sep', price_type: 'supplier_reference_cost', amount_ksh: 700, effective_date: '2026-09-15', created_at: '2026-09-15T00:00:00Z' },
  ] as InventoryPriceHistoryRow[]
  assert.equal(monthPrice(history.slice(0, 1), 'supplier_reference_cost', '2026-09')?.amount_ksh, 675)
  assert.equal(monthPrice(history, 'supplier_reference_cost', '2026-09')?.amount_ksh, 700)
  assert.equal(history.length, 2)
  assert.deepEqual(trailingMonths('2026-09-02'), ['2026-07', '2026-08', '2026-09'])
})

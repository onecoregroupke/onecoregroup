import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateRequirementGroups, NAJMA_COMPATIBILITY_EXPECTATIONS } from './packagingCompatibility'

test('one_of closure options contribute capacity without becoming three mandatory caps', () => {
  const lines = ['white', 'green', 'pink'].map((id) => ({
    id, product_item_id: 'softener-250', component_item_id: id,
    quantity_per_unit: 1, wastage_percent: 0, requirement_group: 'closure',
    selection_mode: 'one_of' as const, compatibility_status: 'compatible' as const, active: true,
  }))
  const grouped = evaluateRequirementGroups(lines, [
    { id: 'white', name: 'White caps', quantity: 0, unit: 'pcs' },
    { id: 'green', name: 'Green caps', quantity: 70, unit: 'pcs' },
    { id: 'pink', name: 'Pink caps', quantity: 50, unit: 'pcs' },
  ], 120)
  assert.equal(grouped.length, 1)
  assert.equal(grouped[0]!.producibleUnits, 120)
  assert.equal(grouped[0]!.shortfallUnits, 0)
})

test('all_required cap and inserter capacity is limited by the shorter component', () => {
  const lines = ['cap', 'inserter'].map((id) => ({
    id, product_item_id: 'softener-1l', component_item_id: id,
    quantity_per_unit: 1, wastage_percent: 0, requirement_group: id,
    selection_mode: 'all_required' as const, compatibility_status: 'compatible' as const, active: true,
  }))
  const grouped = evaluateRequirementGroups(lines, [
    { id: 'cap', name: 'White caps', quantity: 100, unit: 'pcs' },
    { id: 'inserter', name: 'Inserters', quantity: 80, unit: 'pcs' },
  ], 90)
  assert.deepEqual(grouped.map((g) => g.shortfallUnits), [0, 10])
})

test('Najma catalogue covers every required operational relationship', () => {
  const labels = NAJMA_COMPATIBILITY_EXPECTATIONS.map((entry) => entry.label)
  for (const expected of [
    'White trigger pump', 'Yellow cap', 'Small-pack cap alternatives',
    'Fabric Softener 1L / 2L cap', 'Fabric Softener 1L / 2L inserter',
    'Handwash pump', 'Toilet Cleaner cap + inserter pool',
    'Bleach blue cork consolidated pool', 'Shower Gel white cap',
    'Multipurpose green-cap alternatives', '5L cork', '20L cork',
  ]) assert.ok(labels.includes(expected), expected)
  assert.equal(NAJMA_COMPATIBILITY_EXPECTATIONS.find((entry) => entry.label === 'Hand Sanitizer spray allocation')?.intentionallyUnresolved, true)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { inventoryUnitConversionRate, normalizeInventoryUnit, toInventoryBaseQuantity } from './inventoryUnits'

test('litre input labels normalize to the platform litre unit', () => {
  for (const value of ['L', 'litre', 'litres', 'ltr', 'ltrs']) {
    assert.equal(normalizeInventoryUnit(value), 'ltrs')
  }
})

test('litres and millilitres convert explicitly in both directions', () => {
  assert.equal(inventoryUnitConversionRate('litres', 'ml'), 1000)
  assert.equal(toInventoryBaseQuantity(0.8, 'ltrs', 'ml'), 800)
  assert.equal(toInventoryBaseQuantity(800, 'ml', 'ltrs'), 0.8)
})

test('incompatible units are never treated as cosmetic aliases', () => {
  assert.equal(inventoryUnitConversionRate('ltrs', 'kg'), null)
  assert.throws(() => toInventoryBaseQuantity(1, 'ltrs', 'kg'), /Cannot convert/)
})

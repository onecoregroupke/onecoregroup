import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultDisposition, shouldStock, PROCUREMENT_ITEM_TYPES } from './procurementModel'

test('immediate-consumption types default to consume (not stocked)', () => {
  for (const t of ['immediate_expense', 'service', 'student_meal', 'staff_welfare']) {
    assert.equal(defaultDisposition(t), 'consume', `${t} should default to consume`)
  }
})

test('stockable types default to stock', () => {
  for (const t of ['stocked_inventory', 'consumable', 'fixed_asset', 'resale', 'facilities']) {
    assert.equal(defaultDisposition(t), 'stock', `${t} should default to stock`)
  }
})

test('only stock-disposition lines create inventory (the §20 fix)', () => {
  assert.equal(shouldStock('stock'), true)
  assert.equal(shouldStock('consume'), false)
  assert.equal(shouldStock(''), false)
})

test('every item type has a valid default disposition', () => {
  for (const t of PROCUREMENT_ITEM_TYPES) {
    assert.ok(t.defaultDisposition === 'stock' || t.defaultDisposition === 'consume')
  }
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { observeStockCount, toBaseQuantity } from './inventoryIntegrity'

test('box, pack and piece quantities resolve to explicit base quantities', () => {
  assert.equal(toBaseQuantity(2, 24), 48)
  assert.equal(toBaseQuantity(7, 1), 7)
  assert.throws(() => toBaseQuantity(2, 0))
})

test('stock count variance is an observation and never an automatic movement', () => {
  assert.deepEqual(observeStockCount(237, 237), {
    physicalQuantity: 237, systemQuantity: 237, variance: 0, createsMovement: false,
  })
  assert.deepEqual(observeStockCount(230, 237), {
    physicalQuantity: 230, systemQuantity: 237, variance: -7, createsMovement: false,
  })
})


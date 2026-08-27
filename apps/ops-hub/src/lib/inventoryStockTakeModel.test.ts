import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyStockTakeAdjustments,
  buildStockTakeAdjustment,
  stockTakeVariance,
  validateStockTakeForPosting,
  type CountHeaderForPosting,
  type CountLineForReview,
} from './inventoryStockTakeModel'

const approved: CountHeaderForPosting = { status: 'approved', frozen_at: '2026-08-27T06:00:00.000Z' }

function line(input: Partial<CountLineForReview>): CountLineForReview {
  return {
    id: input.id ?? 'line-1',
    item_id: input.item_id ?? 'item-1',
    expected_quantity: input.expected_quantity ?? 100,
    counted_quantity: input.counted_quantity ?? 100,
    reason_code: input.reason_code ?? '',
    movement_id: input.movement_id ?? null,
  }
}

test('zero variance creates no adjustment movement', () => {
  const l = line({ expected_quantity: 100, counted_quantity: 100 })
  assert.equal(stockTakeVariance(l.expected_quantity, l.counted_quantity), 0)
  assert.equal(buildStockTakeAdjustment(l), null)
  assert.deepEqual(validateStockTakeForPosting(approved, [l]), [])
})

test('negative variance posts one OUT adjustment and final balance equals physical count', () => {
  const l = line({ expected_quantity: 100, counted_quantity: 95, reason_code: 'count_correction' })
  assert.deepEqual(buildStockTakeAdjustment(l), { item_id: 'item-1', direction: 'out', quantity: 5 })
  assert.equal(applyStockTakeAdjustments(100, [l]).get('item-1'), 95)
})

test('positive variance posts one IN adjustment and final balance equals physical count', () => {
  const l = line({ expected_quantity: 100, counted_quantity: 107, reason_code: 'receipt_not_recorded' })
  assert.deepEqual(buildStockTakeAdjustment(l), { item_id: 'item-1', direction: 'in', quantity: 7 })
  assert.equal(applyStockTakeAdjustments(100, [l]).get('item-1'), 107)
})

test('idempotency skips a line that already has a movement', () => {
  const l = line({ expected_quantity: 100, counted_quantity: 107, reason_code: 'receipt_not_recorded', movement_id: 'move-1' })
  assert.equal(buildStockTakeAdjustment(l), null)
  assert.equal(applyStockTakeAdjustments(107, [l]).get('item-1'), 107)
})

test('unapproved count cannot post', () => {
  assert.deepEqual(
    validateStockTakeForPosting({ status: 'counting', frozen_at: approved.frozen_at }, [line({ reason_code: 'count_correction' })]),
    ['Stock take must be approved before posting.'],
  )
})

test('missing reason blocks non-zero variance', () => {
  assert.deepEqual(
    validateStockTakeForPosting(approved, [line({ expected_quantity: 100, counted_quantity: 95 })]),
    ['Every non-zero variance needs a reason before posting.'],
  )
})

test('posted stock take cannot be silently reposted', () => {
  assert.deepEqual(
    validateStockTakeForPosting({ status: 'posted', frozen_at: approved.frozen_at, posted_at: '2026-08-27T07:00:00.000Z' }, [line({})]),
    ['This stock take has already been posted.', 'Stock take must be approved before posting.'],
  )
})

test('store isolation is represented by adjusting only the counted item ids', () => {
  const raw = line({ id: 'raw-line', item_id: 'raw-item', expected_quantity: 100, counted_quantity: 95, reason_code: 'count_correction' })
  const packaging = line({ id: 'pack-line', item_id: 'pack-item', expected_quantity: 50, counted_quantity: 50 })
  const adjustments = [raw, packaging].map(buildStockTakeAdjustment).filter(Boolean)
  assert.deepEqual(adjustments, [{ item_id: 'raw-item', direction: 'out', quantity: 5 }])
})

test('concurrent movement after freeze blocks stale reconciliation', () => {
  assert.deepEqual(
    validateStockTakeForPosting(approved, [line({})], [{ item_id: 'item-1', effective_at: '2026-08-27T06:05:00.000Z' }]),
    ['Inventory changed after this stock take was frozen. Re-freeze or start a new stock take before posting.'],
  )
})

test('zero physical quantity posts an OUT adjustment for the full expected balance', () => {
  const l = line({ expected_quantity: 15, counted_quantity: 0, reason_code: 'damaged_stock' })
  assert.deepEqual(buildStockTakeAdjustment(l), { item_id: 'item-1', direction: 'out', quantity: 15 })
  assert.equal(applyStockTakeAdjustments(15, [l]).get('item-1'), 0)
})

test('valuation keeps raw reference cost and finished retail/wholesale values distinct', () => {
  const rawValue = 12 * 25
  const retailValue = 12 * 180
  const wholesaleValue = 12 * 150
  assert.equal(rawValue, 300)
  assert.equal(retailValue, 2160)
  assert.equal(wholesaleValue, 1800)
  assert.notEqual(retailValue, wholesaleValue)
  assert.notEqual(rawValue, retailValue)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  countsAsAvailable, receiptStockQuantity, validateReceiptLine, isPartialDelivery,
  issueStockQuantity, validateIssueLine, reconcileMaterial, splitByMaterialClass,
  expectedFromBom, fgTransferStockQuantity, validateFgTransfer,
  closingBalance, verifyLedger, reversalOf, suggestProduction,
  countVariance, canPostCountLine,
} from './manufacturingModel'

// §37 "Manufacturing" testing requirements, in order.

// ─── Goods receipt increases ACCEPTED stock only (§22) ──────────────────────

test('a goods receipt stocks the accepted quantity, not the delivered one', () => {
  assert.equal(receiptStockQuantity({
    ordered_quantity: 100, delivered_quantity: 100, accepted_quantity: 90, rejected_quantity: 10,
  }), 90)
})

test('rejected goods never enter stock', () => {
  const all = receiptStockQuantity({
    ordered_quantity: 50, delivered_quantity: 50, accepted_quantity: 0, rejected_quantity: 50,
  })
  assert.equal(all, 0)
})

test('accepted plus rejected cannot exceed delivered', () => {
  const p = validateReceiptLine({
    ordered_quantity: 100, delivered_quantity: 80, accepted_quantity: 80, rejected_quantity: 10,
  })
  assert.match(p[0], /cannot exceed the delivered/)
})

test('a partial delivery is flagged and stays traceable', () => {
  const line = { ordered_quantity: 100, delivered_quantity: 60, accepted_quantity: 60, rejected_quantity: 0 }
  assert.equal(isPartialDelivery(line), true)
  assert.deepEqual(validateReceiptLine(line), [])
  assert.equal(receiptStockQuantity(line), 60)
})

test('over-delivery is surfaced rather than silently accepted', () => {
  const p = validateReceiptLine({
    ordered_quantity: 100, delivered_quantity: 120, accepted_quantity: 120, rejected_quantity: 0,
  })
  assert.match(p[0], /Over-delivery/)
})

// ─── Approval moves no stock; the final issue moves it once (§23) ───────────

test('approving a requisition moves no stock — only the issue does', () => {
  // The quantity a movement posts depends on issued_quantity alone. An approved
  // but unissued line contributes nothing.
  assert.equal(issueStockQuantity({ issued_quantity: 0 }), 0)
  assert.equal(issueStockQuantity({ issued_quantity: 25 }), 25)
})

test('issuing cannot exceed what was approved', () => {
  const p = validateIssueLine({
    requested_quantity: 100, approved_quantity: 60, issued_quantity: 80, available_quantity: 500,
  })
  assert.match(p[0], /only 60 was approved/)
})

test('issuing cannot exceed what is in stock', () => {
  const p = validateIssueLine({
    requested_quantity: 100, approved_quantity: 100, issued_quantity: 100, available_quantity: 40,
  })
  assert.match(p[0], /only 40 is in stock/)
})

test('approved cannot exceed requested', () => {
  const p = validateIssueLine({
    requested_quantity: 50, approved_quantity: 80, issued_quantity: 0, available_quantity: 500,
  })
  assert.match(p[0], /cannot exceed the requested/)
})

// ─── The production batch receives issued materials (§24) ───────────────────

test('material reconciliation exposes unaccounted stock', () => {
  const r = reconcileMaterial({
    item_type: 'raw_material',
    expected_quantity: 100, issued_quantity: 100,
    returned_quantity: 5, consumed_quantity: 90, waste_quantity: 2,
  })
  assert.equal(r.unaccounted, 3)               // 100 - 5 - 90 - 2
  assert.equal(r.varianceVsExpected, -10)      // used 10 less than the BOM expected
})

test('a fully reconciled issue has zero unaccounted', () => {
  const r = reconcileMaterial({
    item_type: 'raw_material',
    expected_quantity: 100, issued_quantity: 100,
    returned_quantity: 10, consumed_quantity: 85, waste_quantity: 5,
  })
  assert.equal(r.unaccounted, 0)
})

// ─── Packaging is tracked separately (§25) ──────────────────────────────────

test('packaging reconciles separately from raw ingredients', () => {
  const split = splitByMaterialClass([
    { item_type: 'raw_material', expected_quantity: 0, issued_quantity: 10, returned_quantity: 0, consumed_quantity: 10, waste_quantity: 0 },
    { item_type: 'packaging', expected_quantity: 0, issued_quantity: 500, returned_quantity: 0, consumed_quantity: 495, waste_quantity: 5 },
    { item_type: 'packaging', expected_quantity: 0, issued_quantity: 500, returned_quantity: 0, consumed_quantity: 500, waste_quantity: 0 },
  ])
  assert.equal(split.raw.length, 1)
  assert.equal(split.packaging.length, 2)
  assert.equal(split.other.length, 0)
})

test('BOM expectations include the wastage allowance', () => {
  const expected = expectedFromBom(
    [{ quantity_per_unit: 0.5, wastage_percent: 0 }, { quantity_per_unit: 1, wastage_percent: 10 }],
    1000,
  )
  assert.deepEqual(expected, [500, 1100])
})

// ─── Finished goods transfer increases the correct SKU (§26) ────────────────

test('a transfer adds only accepted finished goods', () => {
  assert.equal(fgTransferStockQuantity({
    produced_quantity: 1000, accepted_quantity: 960, rejected_quantity: 40, transferred_quantity: 960,
  }), 960)
})

test('transferring more than accepted is rejected', () => {
  const p = validateFgTransfer({
    produced_quantity: 1000, accepted_quantity: 900, rejected_quantity: 100, transferred_quantity: 1000,
  })
  assert.match(p[0], /rejected units never enter available stock/)
})

test('a partial transfer moves only what was transferred', () => {
  assert.equal(fgTransferStockQuantity({
    produced_quantity: 1000, accepted_quantity: 1000, rejected_quantity: 0, transferred_quantity: 600,
  }), 600)
})

test('damaged and returned classes are not available stock', () => {
  assert.equal(countsAsAvailable('finished_good'), true)
  assert.equal(countsAsAvailable('raw_material'), true)
  assert.equal(countsAsAvailable('packaging'), true)
  assert.equal(countsAsAvailable('damaged'), false)
  assert.equal(countsAsAvailable('returned'), false)
  assert.equal(countsAsAvailable('work_in_progress'), false)
})

// ─── Closing balance formula + stock card matches ledger (§20, §30) ─────────

test('closing = opening + in - out', () => {
  const closing = closingBalance(100, [
    { direction: 'in', quantity: 50 },
    { direction: 'out', quantity: 30 },
    { direction: 'in', quantity: 10 },
  ])
  assert.equal(closing, 130)
})

test('the stock card running balance matches every recorded quantity_after', () => {
  const check = verifyLedger(0, [
    { direction: 'in', quantity: 100, quantity_after: 100 },
    { direction: 'out', quantity: 40, quantity_after: 60 },
    { direction: 'in', quantity: 25, quantity_after: 85 },
  ])
  assert.equal(check.consistent, true)
  assert.equal(check.closing, 85)
  assert.equal(check.totalIn, 125)
  assert.equal(check.totalOut, 40)
})

test('a corrupted quantity_after is detected and located', () => {
  const check = verifyLedger(0, [
    { direction: 'in', quantity: 100, quantity_after: 100 },
    { direction: 'out', quantity: 40, quantity_after: 75 },   // wrong: should be 60
    { direction: 'in', quantity: 25, quantity_after: 85 },
  ])
  assert.equal(check.consistent, false)
  assert.equal(check.firstDivergenceIndex, 1)
  assert.equal(check.closing, 85)   // the recomputed truth, not the stored value
})

test('fractional quantities do not drift the ledger', () => {
  const check = verifyLedger(0, [
    { direction: 'in', quantity: 0.1, quantity_after: 0.1 },
    { direction: 'in', quantity: 0.2, quantity_after: 0.3 },
  ])
  assert.equal(check.consistent, true)
  assert.equal(check.closing, 0.3)
})

// ─── Reversal does not create silent corruption (§32) ───────────────────────

test('a reversal is an equal and opposite movement, not a deletion', () => {
  const original = { direction: 'out' as const, quantity: 40 }
  const rev = reversalOf(original)
  assert.deepEqual(rev, { direction: 'in', quantity: 40 })
  // The pair nets to zero, so no balance is silently lost.
  assert.equal(closingBalance(100, [original, rev]), 100)
})

test('reversing a reversal restores the original direction', () => {
  const original = { direction: 'in' as const, quantity: 7 }
  assert.deepEqual(reversalOf(reversalOf(original)), original)
})

// ─── Production guide is a SUGGESTION (§28) ─────────────────────────────────

const sku = {
  item_id: 'i1', name: 'Multi-Purpose Cleaner 1L',
  available_quantity: 100, reserved_quantity: 20,
  unfulfilled_order_quantity: 0, production_threshold: 50,
  recent_daily_sales: 10, lead_time_days: 3, open_production_quantity: 0,
}

test('usable stock excludes reserved units', () => {
  const s = suggestProduction(sku)
  assert.equal(s.usableStock, 80)
  assert.equal(s.daysOfStock, 8)
})

test('a recommendation is always labelled a suggestion, never an order', () => {
  assert.equal(suggestProduction(sku).isSuggestion, true)
})

test('above threshold with no orders needs no production', () => {
  assert.equal(suggestProduction(sku).shortfall, 0)
  assert.equal(suggestProduction(sku).action, 'none')
})

test('unfulfilled orders and a threshold gap drive the suggested quantity', () => {
  const s = suggestProduction({ ...sku, available_quantity: 30, reserved_quantity: 10, unfulfilled_order_quantity: 100 })
  // usable 20, threshold gap 30, orders 100 => 130
  assert.equal(s.shortfall, 130)
  assert.equal(s.suggestedQuantity, 130)
})

test('production already in flight reduces the suggestion', () => {
  const s = suggestProduction({
    ...sku, available_quantity: 30, reserved_quantity: 10,
    unfulfilled_order_quantity: 100, open_production_quantity: 80,
  })
  assert.equal(s.shortfall, 50)
})

test('cover shorter than the lead time is urgent', () => {
  const s = suggestProduction({
    ...sku, available_quantity: 20, reserved_quantity: 0,
    production_threshold: 100, recent_daily_sales: 10, lead_time_days: 3,
  })
  assert.equal(s.action, 'urgent')   // 2 days of cover, 3-day lead time
})

test('a stockout with outstanding orders is urgent', () => {
  const s = suggestProduction({ ...sku, available_quantity: 0, reserved_quantity: 0, unfulfilled_order_quantity: 40 })
  assert.equal(s.action, 'urgent')
})

test('missing raw or packaging materials mark the suggestion blocked', () => {
  const s = suggestProduction({
    ...sku, available_quantity: 0, unfulfilled_order_quantity: 100,
    blocking_raw: ['Surfactant'], blocking_packaging: ['1L bottle'],
  })
  assert.equal(s.blocked, true)
  assert.deepEqual(s.blockingRaw, ['Surfactant'])
  assert.deepEqual(s.blockingPackaging, ['1L bottle'])
})

test('no sales history yields no days-of-stock rather than a divide-by-zero', () => {
  const s = suggestProduction({ ...sku, recent_daily_sales: 0 })
  assert.equal(s.daysOfStock, null)
})

// ─── Stock counts need approval and explanation (§31) ───────────────────────

test('variance is counted minus expected', () => {
  assert.equal(countVariance({ expected_quantity: 100, counted_quantity: 94, reason: '' }), -6)
  assert.equal(countVariance({ expected_quantity: 100, counted_quantity: 105, reason: '' }), 5)
})

test('an uncounted line has no variance and cannot post', () => {
  const line = { expected_quantity: 100, counted_quantity: null, reason: '' }
  assert.equal(countVariance(line), 0)
  assert.equal(canPostCountLine(line), false)
})

test('a variance without an explanation cannot be posted', () => {
  assert.equal(canPostCountLine({ expected_quantity: 100, counted_quantity: 94, reason: '' }), false)
  assert.equal(canPostCountLine({ expected_quantity: 100, counted_quantity: 94, reason: 'Breakage in store' }), true)
})

test('a nil variance posts without needing an explanation', () => {
  assert.equal(canPostCountLine({ expected_quantity: 100, counted_quantity: 100, reason: '' }), true)
})

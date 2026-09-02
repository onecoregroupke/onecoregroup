import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  custodyDirectionFor, custodyBalance,
  allocationStockEffect, invoiceStockEffect, returnStockEffect, damageStockEffect,
  positionBalance, flagCustodyIssues, paymentMismatch, reconcileWeek,
  detectDuplicateReferences, type CustodyPosition,
} from './fieldSalesModel'

// Addendum §35 "Field sales" testing requirements, in order.

// ─── The delivery note transfers stock into custody (§16) ───────────────────

test('a weekly delivery note reduces the store and increases custody', () => {
  const e = allocationStockEffect(500)
  assert.equal(e.mainStore, -500)
  assert.equal(e.custody, +500)
})

test('a custody transfer leaves total company-owned stock unchanged', () => {
  // §16: "Preserve the total stock owned by Iceland."
  assert.equal(allocationStockEffect(500).companyOwned, 0)
})

test('a custody transfer creates no revenue and no invoice', () => {
  assert.equal(allocationStockEffect(500).createsRevenue, false)
})

// ─── THE double-deduction guard (§19) ───────────────────────────────────────

test('a daily invoice reduces custody only — the main store is NOT touched again', () => {
  // This is the rule the addendum states outright: "Do not deduct sold stock
  // twice from the main store." The delivery note already reduced it.
  const e = invoiceStockEffect(120)
  assert.equal(e.mainStore, 0)
  assert.equal(e.custody, -120)
})

test('an invoice does reduce company-owned stock — the goods have left', () => {
  assert.equal(invoiceStockEffect(120).companyOwned, -120)
  assert.equal(invoiceStockEffect(120).createsRevenue, true)
})

test('allocating then selling deducts the main store exactly once', () => {
  const alloc = allocationStockEffect(500)
  const sale = invoiceStockEffect(300)
  assert.equal(alloc.mainStore + sale.mainStore, -500)   // not -800
  assert.equal(alloc.custody + sale.custody, 200)
})

test('E–H: delivery, two sales, and a mixed return preserve the store/custody boundary', () => {
  let store = 100
  let custody = 0
  for (const effect of [
    allocationStockEffect(20),
    invoiceStockEffect(7),
    invoiceStockEffect(3),
    returnStockEffect(6, 1),
  ]) {
    store += effect.mainStore
    custody += effect.custody
  }
  assert.equal(store, 86) // 100 - 20 + 6; sales never touch store again
  assert.equal(custody, 3) // 20 - 7 - 3 - 7
})

// ─── Returns (§22) ──────────────────────────────────────────────────────────

test('accepted returns restore store stock; damaged returns do not', () => {
  const e = returnStockEffect(180, 20)
  assert.equal(e.mainStore, +180)
  assert.equal(e.custody, -200)          // all 200 leave custody
  assert.equal(e.companyOwned, -20)      // the 20 rejected are written off
})

test('a fully accepted return is stock-neutral for the company', () => {
  assert.equal(returnStockEffect(200, 0).companyOwned, 0)
})

test('damage in the field never re-enters the store', () => {
  const e = damageStockEffect(5)
  assert.equal(e.mainStore, 0)
  assert.equal(e.custody, -5)
  assert.equal(e.companyOwned, -5)
})

// ─── Custody ledger direction + balance (§17) ───────────────────────────────

test('only an issue increases custody', () => {
  assert.equal(custodyDirectionFor('issue'), 'in')
  for (const k of ['sale', 'return', 'damage', 'sample', 'promotion'] as const) {
    assert.equal(custodyDirectionFor(k), 'out', k)
  }
})

test('the custody formula sums the ledger', () => {
  const balance = custodyBalance(0, [
    { movement_kind: 'issue', direction: 'in', quantity: 500 },
    { movement_kind: 'sale', direction: 'out', quantity: 300 },
    { movement_kind: 'damage', direction: 'out', quantity: 5 },
    { movement_kind: 'return', direction: 'out', quantity: 195 },
  ])
  assert.equal(balance, 0)
})

const pos = (over: Partial<CustodyPosition>): CustodyPosition => ({
  item_id: 'i1', issued: 500, sold: 0, returned: 0, damaged: 0, promotional: 0, ...over,
})

test('position balance is issued less everything that left custody', () => {
  assert.equal(positionBalance(pos({ sold: 300, returned: 190, damaged: 10 })), 0)
  assert.equal(positionBalance(pos({ sold: 300 })), 200)
})

// ─── Flags (§20) ────────────────────────────────────────────────────────────

test('invoicing more than was allocated is flagged', () => {
  const flags = flagCustodyIssues([pos({ issued: 100, sold: 120 })])
  assert.ok(flags.some((f) => f.kind === 'invoiced_exceeds_allocated'))
})

test('returning more than remains is flagged', () => {
  const flags = flagCustodyIssues([pos({ issued: 100, sold: 60, returned: 50 })])
  assert.ok(flags.some((f) => f.kind === 'returned_exceeds_remaining'))
})

test('a negative custody balance is flagged', () => {
  const flags = flagCustodyIssues([pos({ issued: 100, sold: 80, returned: 30 })])
  assert.ok(flags.some((f) => f.kind === 'negative_custody'))
})

test('invoicing a SKU that was never allocated is flagged', () => {
  const flags = flagCustodyIssues([pos({ item_id: 'i1' })], { invoicedItemIds: ['i2'] })
  assert.ok(flags.some((f) => f.kind === 'sku_not_allocated' && f.item_id === 'i2'))
})

test('a clean week produces no flags', () => {
  assert.deepEqual(flagCustodyIssues([pos({ sold: 300, returned: 200 })]), [])
})

test('every problem is reported, not just the first', () => {
  const flags = flagCustodyIssues([
    pos({ item_id: 'a', issued: 100, sold: 120 }),
    pos({ item_id: 'b', issued: 100, sold: 80, returned: 40 }),
  ])
  assert.ok(flags.length >= 3)
})

// ─── Payment reconciliation (§28) ───────────────────────────────────────────

test('submitted cash must match invoiced sales less credit', () => {
  const r = paymentMismatch({ invoicedTotal: 10000, cash: 4000, mobileMoney: 4000, bank: 0, credit: 2000 })
  assert.equal(r.expected, 8000)
  assert.equal(r.submitted, 8000)
  assert.equal(r.matches, true)
})

test('a shortfall in submitted payment is detected', () => {
  const r = paymentMismatch({ invoicedTotal: 10000, cash: 3000, mobileMoney: 4000, bank: 0, credit: 2000 })
  assert.equal(r.difference, -1000)
  assert.equal(r.matches, false)
})

test('cent-level rounding does not create a false mismatch', () => {
  const r = paymentMismatch({ invoicedTotal: 100.1, cash: 50.05, mobileMoney: 50.05, bank: 0, credit: 0 })
  assert.equal(r.matches, true)
})

// ─── Weekly closure (§21) ───────────────────────────────────────────────────

test('a fully reconciled week can close', () => {
  const r = reconcileWeek([pos({ sold: 300, returned: 200 })])
  assert.equal(r.unexplainedVariance, 0)
  assert.equal(r.flags.length, 0)
  assert.equal(r.canClose, true)
})

test('stock still held is outstanding custody, not an unexplained loss', () => {
  const r = reconcileWeek([pos({ sold: 300, returned: 150 })])
  assert.equal(r.outstandingCustody, 50)
  assert.equal(r.unexplainedVariance, 0)
  assert.equal(r.canClose, false)
})

test('a physical count mismatch is unexplained variance', () => {
  const r = reconcileWeek([pos({ sold: 300, returned: 150 })], { reportedOnHand: { i1: 40 } })
  assert.equal(r.outstandingCustody, 50)
  assert.equal(r.unexplainedVariance, 10)
  assert.equal(r.canClose, false)
})

test('opposing SKU count errors cannot cancel into a clean reconciliation', () => {
  const r = reconcileWeek([
    pos({ item_id: 'i1', issued: 10 }),
    pos({ item_id: 'i2', issued: 10 }),
  ], { reportedOnHand: { i1: 9, i2: 11 } })
  assert.equal(r.unexplainedVariance, 2)
  assert.equal(r.canClose, false)
})

test('a manager approval WITH a reason unlocks closure', () => {
  const r = reconcileWeek([pos({ sold: 300, returned: 150 })], {
    managerApproval: { approvedBy: 'Anthony', reason: 'Stock left on the van overnight' },
  })
  assert.equal(r.canClose, true)
})

test('an approval with a blank reason does NOT unlock closure', () => {
  const r = reconcileWeek([pos({ sold: 300, returned: 150 })], {
    managerApproval: { approvedBy: 'Anthony', reason: '   ' },
  })
  assert.equal(r.canClose, false)
})

test('an approval with no approver named does not unlock closure', () => {
  const r = reconcileWeek([pos({ sold: 300, returned: 150 })], {
    managerApproval: { approvedBy: '', reason: 'Some reason' },
  })
  assert.equal(r.canClose, false)
})

test('weekly totals roll up across SKUs', () => {
  const r = reconcileWeek([
    pos({ item_id: 'a', issued: 500, sold: 300, returned: 200 }),
    pos({ item_id: 'b', issued: 200, sold: 150, returned: 45, damaged: 5 }),
  ])
  assert.equal(r.totalIssued, 700)
  assert.equal(r.totalSold, 450)
  assert.equal(r.totalReturned, 245)
  assert.equal(r.totalDamaged, 5)
  assert.equal(r.unexplainedVariance, 0)
})

// ─── Spreadsheet import safety (§24) ────────────────────────────────────────

test('an import that repeats an existing delivery note is caught', () => {
  const d = detectDuplicateReferences([{ reference: 'DN-1043' }], ['DN-1043'])
  assert.deepEqual(d, ['DN-1043'])
})

test('duplicate detection ignores case and surrounding whitespace', () => {
  assert.deepEqual(detectDuplicateReferences([{ reference: ' dn-1043 ' }], ['DN-1043']), [' dn-1043 '])
})

test('a reference repeated twice within one import is caught', () => {
  const d = detectDuplicateReferences([{ reference: 'INV-1' }, { reference: 'INV-1' }], [])
  assert.equal(d.length, 1)
})

test('blank references are not treated as duplicates of each other', () => {
  assert.deepEqual(detectDuplicateReferences([{ reference: '' }, { reference: '  ' }], []), [])
})

test('a genuinely new reference is not flagged', () => {
  assert.deepEqual(detectDuplicateReferences([{ reference: 'DN-1044' }], ['DN-1043']), [])
})

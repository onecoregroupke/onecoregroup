import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calculatedClosingBalance, totalAvailable, transactionCashImpact, floatVariance,
  checkFloatClosure, openNextFloat, checkDocumentCompleteness, sortPacketDocuments,
  scoreQbMatch, allocateMatch, DEFAULT_DOCUMENT_RULES,
} from './pettyCashFloatModel'

// Addendum §35 "Petty cash" + "QuickBooks imports" testing requirements.

const funding = { opening_amount: 50000, balance_brought_forward: 0, additional_funding: 0 }
const noActivity = { expenses: 0, transaction_charges: 0, refunds: 0, adjustments: 0 }

// ─── Balance formula (§8) ───────────────────────────────────────────────────

test('a fresh float with no activity holds its opening amount', () => {
  assert.equal(calculatedClosingBalance(funding, noActivity), 50000)
})

test('the closing balance follows the stated formula', () => {
  const balance = calculatedClosingBalance(
    { opening_amount: 50000, balance_brought_forward: 3200, additional_funding: 10000 },
    { expenses: 21000, transaction_charges: 350, refunds: 500, adjustments: 0 },
  )
  // 50000 + 3200 + 10000 + 500 - 21000 - 350
  assert.equal(balance, 42350)
})

test('transaction charges are separate from the expense, not folded into it', () => {
  // The Iceland sheets record these apart; collapsing them would lose a
  // distinction finance already maintains.
  const impact = transactionCashImpact({
    expense_amount: 2000, transaction_charge: 30, withdrawal_charge: 25, secondary_charge: 5,
  })
  assert.equal(impact, 2060)
})

test('an expense with no charges has a cash impact equal to itself', () => {
  assert.equal(transactionCashImpact({ expense_amount: 1500 }), 1500)
})

test('total available is opening plus carry-forward plus funding', () => {
  assert.equal(totalAvailable({ opening_amount: 50000, balance_brought_forward: 3200, additional_funding: 10000 }), 63200)
})

test('cent-level amounts do not drift', () => {
  const balance = calculatedClosingBalance(
    { opening_amount: 100.1, balance_brought_forward: 0.2, additional_funding: 0 },
    { expenses: 0.3, transaction_charges: 0, refunds: 0, adjustments: 0 },
  )
  assert.equal(balance, 100)
})

test('variance is physical minus calculated, and unknown when uncounted', () => {
  assert.equal(floatVariance(42350, 42000), -350)
  assert.equal(floatVariance(42350, 42350), 0)
  assert.equal(floatVariance(42350, null), null)
})

// ─── Closure (§9) ───────────────────────────────────────────────────────────

const closureBase = {
  funding, activity: noActivity,
  physicalBalance: 50000, varianceExplanation: '',
  transactionsMissingDocuments: 0, transactionsUnreconciled: 0,
  reviewedBy: 'Gumi',
}

test('a clean, reviewed, fully documented float can close', () => {
  const r = checkFloatClosure(closureBase)
  assert.equal(r.canClose, true)
  assert.deepEqual(r.problems, [])
})

test('a float with outstanding documents cannot close', () => {
  const r = checkFloatClosure({ ...closureBase, transactionsMissingDocuments: 2 })
  assert.equal(r.canClose, false)
  assert.match(r.problems[0], /missing supporting documents/)
})

test('an uncounted physical balance blocks closure', () => {
  const r = checkFloatClosure({ ...closureBase, physicalBalance: null })
  assert.equal(r.canClose, false)
  assert.match(r.problems[0], /physical cash balance has not been recorded/)
})

test('an unexplained variance blocks closure', () => {
  const r = checkFloatClosure({ ...closureBase, physicalBalance: 49500 })
  assert.equal(r.variance, -500)
  assert.equal(r.canClose, false)
  assert.match(r.problems[0], /must be explained/)
})

test('an explained variance permits closure', () => {
  const r = checkFloatClosure({
    ...closureBase, physicalBalance: 49500, varianceExplanation: 'Shortfall reported to finance',
  })
  assert.equal(r.canClose, true)
})

test('closure requires a finance review', () => {
  const r = checkFloatClosure({ ...closureBase, reviewedBy: '  ' })
  assert.equal(r.canClose, false)
  assert.match(r.problems[0], /Finance review is required/)
})

test('unreconciled transactions block closure only when reconciliation is required', () => {
  assert.equal(checkFloatClosure({ ...closureBase, transactionsUnreconciled: 3 }).canClose, true)
  assert.equal(
    checkFloatClosure({ ...closureBase, transactionsUnreconciled: 3, requireReconciliation: true }).canClose,
    false,
  )
})

// ─── Carry-forward (§10) — the double-count guard ───────────────────────────

test('a carried balance opens the next float as brought-forward', () => {
  const next = openNextFloat({ previousClosingBalance: 3200, decision: 'carried', newFundingAmount: 50000 })
  assert.equal(next.balance_brought_forward, 3200)
  assert.equal(next.opening_amount, 50000)
  assert.equal(next.total_available, 53200)
})

test('a RETURNED balance is not also carried forward', () => {
  // §10: "Do not count the carried-forward amount twice."
  const next = openNextFloat({ previousClosingBalance: 3200, decision: 'returned', newFundingAmount: 50000 })
  assert.equal(next.balance_brought_forward, 0)
  assert.equal(next.total_available, 50000)
})

test('reimbursed and written-off balances also leave the cycle', () => {
  for (const decision of ['reimbursed', 'written_off'] as const) {
    const next = openNextFloat({ previousClosingBalance: 3200, decision, newFundingAmount: 50000 })
    assert.equal(next.balance_brought_forward, 0, decision)
    assert.equal(next.total_available, 50000, decision)
  }
})

test('a nil closing balance carries nothing', () => {
  const next = openNextFloat({ previousClosingBalance: 0, decision: 'carried', newFundingAmount: 50000 })
  assert.equal(next.balance_brought_forward, 0)
})

// ─── Document completeness (§13) ────────────────────────────────────────────

test('a stock purchase needs its full procurement chain of documents', () => {
  const r = checkDocumentCompleteness(DEFAULT_DOCUMENT_RULES.stock_purchase, ['supplier_invoice'])
  assert.equal(r.complete, false)
  assert.ok(r.missing.includes('goods_received_note'))
  assert.ok(r.missing.includes('delivery_note'))
})

test('the reported status names the most actionable gap', () => {
  assert.equal(checkDocumentCompleteness(['supplier_invoice', 'receipt'], ['receipt']).status, 'missing_invoice')
  assert.equal(checkDocumentCompleteness(['goods_received_note'], []).status, 'missing_grn')
  assert.equal(checkDocumentCompleteness(['mpesa_confirmation'], []).status, 'missing_payment_reference')
  assert.equal(checkDocumentCompleteness(['approval'], []).status, 'awaiting_approval')
})

test('a fully documented transaction reports complete', () => {
  const r = checkDocumentCompleteness(['receipt', 'mpesa_confirmation'], ['receipt', 'mpesa_confirmation'])
  assert.equal(r.complete, true)
  assert.deepEqual(r.missing, [])
})

test('extra documents beyond the requirement are fine', () => {
  const r = checkDocumentCompleteness(['receipt'], ['receipt', 'photo', 'approval'])
  assert.equal(r.complete, true)
})

test('the merged packet is assembled in the specified order', () => {
  const sorted = sortPacketDocuments([
    { document_type: 'mpesa_confirmation' },
    { document_type: 'voucher' },
    { document_type: 'goods_received_note' },
    { document_type: 'supplier_invoice' },
  ])
  assert.deepEqual(sorted.map((d) => d.document_type), [
    'voucher', 'supplier_invoice', 'goods_received_note', 'mpesa_confirmation',
  ])
})

test('an unknown document type sorts last rather than being dropped', () => {
  const sorted = sortPacketDocuments([{ document_type: 'mystery' }, { document_type: 'voucher' }])
  assert.deepEqual(sorted.map((d) => d.document_type), ['voucher', 'mystery'])
})

// ─── QuickBooks matching (§4) ───────────────────────────────────────────────

test('matching on amount ALONE is never acceptable', () => {
  // §4: "Do not match solely by amount."
  const s = scoreQbMatch({ amount: 2000 }, { amount: 2000 })
  assert.deepEqual(s.basis, ['amount'])
  assert.equal(s.acceptable, false)
})

test('amount plus date is acceptable', () => {
  const s = scoreQbMatch(
    { amount: 2000, transaction_date: '2026-08-05' },
    { amount: 2000, transaction_date: '2026-08-05' },
  )
  assert.ok(s.basis.includes('amount') && s.basis.includes('date'))
  assert.equal(s.acceptable, true)
})

test('an M-Pesa code match scores highest', () => {
  const withCode = scoreQbMatch(
    { amount: 2000, mpesa_code: 'SFF7X2Q1' }, { amount: 2000, mpesa_code: 'sff7x2q1' },
  )
  const withoutCode = scoreQbMatch(
    { amount: 2000, transaction_date: '2026-08-05' }, { amount: 2000, transaction_date: '2026-08-05' },
  )
  assert.ok(withCode.confidence > withoutCode.confidence)
  assert.ok(withCode.basis.includes('mpesa_code'))
})

test('a near date scores lower than an exact date', () => {
  const exact = scoreQbMatch({ amount: 1, transaction_date: '2026-08-05' }, { amount: 1, transaction_date: '2026-08-05' })
  const near = scoreQbMatch({ amount: 1, transaction_date: '2026-08-05' }, { amount: 1, transaction_date: '2026-08-07' })
  assert.ok(exact.confidence > near.confidence)
  assert.ok(near.basis.includes('date_near'))
})

test('a date beyond the window is not a match signal at all', () => {
  const far = scoreQbMatch({ amount: 1, transaction_date: '2026-08-05' }, { amount: 1, transaction_date: '2026-09-20' })
  assert.deepEqual(far.basis, ['amount'])
  assert.equal(far.acceptable, false)
})

test('blank references on both sides do not count as agreement', () => {
  const s = scoreQbMatch({ amount: 2000, reference: '' }, { amount: 2000, reference: '' })
  assert.deepEqual(s.basis, ['amount'])
  assert.equal(s.acceptable, false)
})

test('a completely mismatched pair scores nothing', () => {
  const s = scoreQbMatch({ amount: 100 }, { amount: 900 })
  assert.equal(s.confidence, 0)
  assert.equal(s.acceptable, false)
})

// ─── Split and combined reconciliation (§4) ─────────────────────────────────

test('one QuickBooks transaction splits across several operational records', () => {
  const r = allocateMatch(10000, [{ amount: 6000 }, { amount: 4000 }])
  assert.equal(r.allocated, 10000)
  assert.equal(r.fullyMatched, true)
})

test('a partial allocation reports the remainder rather than rounding it away', () => {
  const r = allocateMatch(10000, [{ amount: 6000 }])
  assert.equal(r.remainder, 4000)
  assert.equal(r.fullyMatched, false)
  assert.equal(r.overAllocated, false)
})

test('over-allocating a transaction is detected', () => {
  const r = allocateMatch(10000, [{ amount: 6000 }, { amount: 5000 }])
  assert.equal(r.remainder, -1000)
  assert.equal(r.overAllocated, true)
})

test('cent-level allocation still reconciles cleanly', () => {
  const r = allocateMatch(2980, [{ amount: 2568.97 }, { amount: 411.03 }])
  assert.equal(r.fullyMatched, true)
  assert.equal(r.remainder, 0)
})

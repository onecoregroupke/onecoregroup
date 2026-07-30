import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePettyCash } from './pettyCash'
import type { WorkbookData, CellValue } from '../../xlsx'

// Synthetic petty-cash fixture mirroring the Wallace structure (two stacked
// blocks whose expense columns SHIFT). No real data.
function wb(rows: CellValue[][]): WorkbookData {
  return { sheets: [{ name: 'Sheet1', rows, rowCount: rows.length, colCount: 9 }] }
}

test('parses income + expense, ZIIDI, skips TOTAL, handles column shift', () => {
  const rows: CellValue[][] = [
    // Block 1 — expense amount in col E(4), payee col F(5), charge col G(6), ZIIDI col H(7), TOTAL col I(8)
    [null, null, new Date('2026-06-30'), 0, null, null, null, null, null],
    [null, 'INCOME', null, null, null, null, null, 'ZIIDI', 'TOTAL'],
    [null, 200000, 'SOURCE-A', null, 6000, 'PAYEE-A', 78, 0, 6078],
    [null, null, null, null, 450, 'PAYEE-B', 7, 4.5, 461.5],
    ['TOTAL', 689000, null, null, null, null, null, 87.5, 226890.5],
    // blank separator
    [null, null, null, null, null, null, null, null, null],
    // Block 2 — expense amount SHIFTS to col D(3); payee col F(5), charge col G(6), TOTAL col H(7)
    [null, null, new Date('2026-06-30'), 16, null, null, null, null, null],
    [null, 'INCOME', null, null, null, null, null, 'TOTAL', null],
    [null, 12000, 'SOURCE-B', 4856, null, 'PAYEE-C', 34, 4890, null],
    ['TOTAL', 12000, null, null, null, null, null, 17303.32, null],
  ]
  const parsed = parsePettyCash(wb(rows))

  // TOTAL rows are not transactions.
  const totals = parsed.filter((p) => p.record_kind === 'subtotal')
  assert.equal(totals.length, 2)

  const expenses = parsed.filter((p) => p.record_kind === 'petty-expense')
  const incomes = parsed.filter((p) => p.record_kind === 'petty-income')

  // Block 1 income.
  const inA = incomes.find((p) => p.mapped['source_of_funds'] === 'SOURCE-A')!
  assert.equal(inA.mapped['cash_received_ksh'], 200000)

  // Block 1 expense with ZIIDI secondary charge.
  const exB = expenses.find((p) => p.mapped['payee'] === 'PAYEE-B')!
  assert.equal(exB.mapped['expense_amount_ksh'], 450)
  assert.equal(exB.mapped['transaction_charge_ksh'], 7)
  assert.equal(exB.mapped['secondary_charge_ksh'], 4.5)
  assert.equal(exB.mapped['secondary_charge_label'], 'ZIIDI')
  assert.equal(exB.mapped['transaction_date'], '2026-06-30')

  // Block 2 expense — amount column shifted to D(3); parser still finds 4856.
  const exC = expenses.find((p) => p.mapped['payee'] === 'PAYEE-C')!
  assert.equal(exC.mapped['expense_amount_ksh'], 4856)
  assert.equal(exC.mapped['transaction_charge_ksh'], 34)
})

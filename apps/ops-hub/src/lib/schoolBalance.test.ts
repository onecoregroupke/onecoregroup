import test from 'node:test'
import assert from 'node:assert/strict'
import { signedAmount, summariseStudentAccount } from './schoolBalance'
import type { SchoolLedgerEntryRow } from '@ocg/db'

// Synthetic entries only — no real student data.
function entry(p: Partial<SchoolLedgerEntryRow>): SchoolLedgerEntryRow {
  return {
    id: Math.random().toString(36).slice(2), school: 'rayyan', brand_id: null, student_id: 's1',
    student_admission_no: '', enrollment_id: null, category_id: null, category_label: '',
    section: '', entry_type: 'charge', entry_date: '2025-01-01', academic_year: '2025', term: '',
    description: '', amount_ksh: 0, currency: 'KES', method: '', receipt_no: '', mpesa_code: '',
    receiving_account_id: null, state: 'posted', reverses_entry_id: null, source_balance: null,
    source_workbook: '', source_sheet: '', source_row: null, import_id: null, notes: '', comment: '',
    recorded_by: '', posted_by: '', posted_at: null, created_at: '', updated_at: '', ...p,
  }
}

test('signedAmount: charges are +, payments are −', () => {
  assert.equal(signedAmount(entry({ entry_type: 'charge', amount_ksh: 1000 })), 1000)
  assert.equal(signedAmount(entry({ entry_type: 'payment', amount_ksh: 400 })), -400)
  assert.equal(signedAmount(entry({ entry_type: 'reversal', amount_ksh: 999 })), 0)
})

test('charges increase due, payments reduce it', () => {
  const s = summariseStudentAccount([
    entry({ entry_type: 'charge', amount_ksh: 1000 }),
    entry({ entry_type: 'payment', amount_ksh: 400 }),
  ])
  assert.equal(s.postedBalance, 600) // positive = owed
  assert.equal(s.totalCharges, 1000)
  assert.equal(s.totalPayments, 400)
})

test('overpayment produces a credit (negative) balance', () => {
  const s = summariseStudentAccount([
    entry({ entry_type: 'charge', amount_ksh: 500 }),
    entry({ entry_type: 'payment', amount_ksh: 800 }),
  ])
  assert.equal(s.postedBalance, -300) // negative = credit / overpaid
})

test('draft entries are excluded from the posted balance', () => {
  const s = summariseStudentAccount([
    entry({ entry_type: 'charge', amount_ksh: 1000, state: 'posted' }),
    entry({ entry_type: 'charge', amount_ksh: 5000, state: 'draft' }),
  ])
  assert.equal(s.postedBalance, 1000)
  assert.equal(s.draftBalance, 5000)
})

test('reversed originals drop out of the balance', () => {
  const s = summariseStudentAccount([
    entry({ entry_type: 'charge', amount_ksh: 1000, state: 'reversed' }),
    entry({ entry_type: 'reversal', amount_ksh: 1000, state: 'posted' }),
  ])
  assert.equal(s.postedBalance, 0)
})

test('balances split by category and by year', () => {
  const s = summariseStudentAccount([
    entry({ entry_type: 'charge', amount_ksh: 1000, category_label: 'Tuition', academic_year: '2024' }),
    entry({ entry_type: 'payment', amount_ksh: 400, category_label: 'Tuition', academic_year: '2024' }),
    entry({ entry_type: 'charge', amount_ksh: 500, category_label: 'Transport', academic_year: '2025' }),
  ])
  assert.equal(s.postedBalance, 1100)
  const tuition = s.byCategory.find((c) => c.label === 'Tuition')!
  assert.equal(tuition.balance, 600)
  const y2025 = s.byYear.find((y) => y.year === '2025')!
  assert.equal(y2025.balance, 500)
})

test('student total equals the sum of ledger entries (decimal-safe)', () => {
  const s = summariseStudentAccount([
    entry({ entry_type: 'charge', amount_ksh: 8000 }),
    entry({ entry_type: 'payment', amount_ksh: 6640 }),
    entry({ entry_type: 'payment', amount_ksh: 8360 }),
  ])
  assert.equal(s.postedBalance, -7000)
})

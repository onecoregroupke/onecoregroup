import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSchoolLedger, looksLikeAdmission } from './schoolLedger'
import type { WorkbookData, CellValue } from '../../xlsx'

// Synthetic fixture mirroring the Rayyan Daycare structure — NO real data.
function wb(rows: CellValue[][]): WorkbookData {
  return { sheets: [{ name: 'DAYCARE FEES', rows, rowCount: rows.length, colCount: 10 }] }
}
const H = ['ADM NO', 'NAME', 'DATE', 'RCT NO', 'MPESA TRANSACTION CODE', 'DETAILS', 'DR', 'CR', 'BALANCE', 'COMMENT']

test('admission pattern detection', () => {
  assert.ok(looksLikeAdmission('2420/001/AR-DC', 'rayyan'))
  assert.ok(looksLikeAdmission('001/06', 'rhythms'))
  assert.ok(!looksLikeAdmission('16', 'rayyan')) // stray number, not an admission
  assert.ok(!looksLikeAdmission('daycare @ 300/=', 'rayyan'))
})

test('carry-down identity, TOTAL skipping, Dr+Cr split', () => {
  const rows: CellValue[][] = [
    H,
    ['2420/001/AR-DC', 'STUDENT ONE', new Date('2024-04-22'), 'RCT 001', 'CODEAAAA1', 'Registration', 200, 200, 0, ''],
    ['', '', new Date('2024-04-25'), 'RCT 002', 'CODEBBBB2', 'daycare @ 300/=', 300, 300, 0, ''],
    ['', '', '', '', '', 'TOTAL', 500, 500, 0, ''],
    [null, null, null, null, null, null, null, null, null, null], // blank separator
    ['2420/002/AR-DC', 'STUDENT TWO', new Date('2024-05-01'), 'RCT 003', 'CODECCCC3', 'Registration', 1000, 400, 600, ''],
  ]
  const parsed = parseSchoolLedger(wb(rows), 'rayyan')

  // TOTAL row must not become a transaction.
  assert.equal(parsed.filter((p) => p.record_kind === 'subtotal').length, 1)
  const txns = parsed.filter((p) => p.record_kind === 'charge' || p.record_kind === 'payment')

  // Row 2: Dr 200 + Cr 200 → one charge + one payment, both for student one.
  const s1 = txns.filter((p) => p.mapped['student_admission_no'] === '2420/001/AR-DC')
  assert.equal(s1.length, 4) // (200 charge, 200 pay) + (300 charge, 300 pay)
  assert.ok(s1.every((p) => p.mapped['student_admission_no'] === '2420/001/AR-DC'))

  // carry-down: the second line inherited student one's admission number.
  const carried = txns.find((p) => p.mapped['description'] === 'daycare @ 300/=')!
  assert.equal(carried.mapped['student_admission_no'], '2420/001/AR-DC')

  // receipts / M-Pesa preserved verbatim as strings.
  const reg = txns.find((p) => p.mapped['description'] === 'Registration' && p.record_kind === 'charge')!
  assert.equal(reg.mapped['receipt_no'], 'RCT 001')
  assert.equal(reg.mapped['mpesa_code'], 'CODEAAAA1')

  // new student after the blank row.
  const s2 = txns.filter((p) => p.mapped['student_admission_no'] === '2420/002/AR-DC')
  assert.equal(s2.length, 2) // 1000 charge + 400 payment
  assert.equal(s2.find((p) => p.record_kind === 'charge')!.mapped['amount_ksh'], 1000)
  assert.equal(s2.find((p) => p.record_kind === 'payment')!.mapped['amount_ksh'], 400)
})

test('dates come from the DATE column as ISO; source balance retained', () => {
  const rows: CellValue[][] = [
    H,
    ['2420/003/AR-DC', 'STUDENT THREE', new Date('2024-07-08'), 'RCT 010', '', 'daycare', 6000, 6000, 0, 'note'],
  ]
  const parsed = parseSchoolLedger(wb(rows), 'rayyan')
  const charge = parsed.find((p) => p.record_kind === 'charge')!
  assert.equal(charge.mapped['entry_date'], '2024-07-08')
  assert.equal(charge.mapped['source_balance'], 0)
  assert.equal(charge.mapped['academic_year'], '2024')
})

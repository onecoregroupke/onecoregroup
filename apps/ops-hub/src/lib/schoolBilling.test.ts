import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildChargeSchedule, scheduleTotal } from './schoolBilling'
import type { SchoolFeeStructureItemRow } from '@ocg/db'

function item(p: Partial<SchoolFeeStructureItemRow>): SchoolFeeStructureItemRow {
  return {
    id: Math.random().toString(36).slice(2), fee_structure_id: 'fs1', category_id: null,
    label: 'Tuition', amount_ksh: 10000, billing_cadence: 'term', is_required: true,
    is_completion_req: false, sort_order: 0, notes: '', created_at: '',
    ...p,
  } as SchoolFeeStructureItemRow
}

test('required items become charge lines; optional excluded by default', () => {
  const lines = buildChargeSchedule([
    item({ label: 'Tuition', amount_ksh: 30000, is_required: true }),
    item({ label: 'Trip (optional)', amount_ksh: 5000, is_required: false }),
  ])
  assert.deepEqual(lines.map((l) => l.label), ['Tuition'])
  assert.equal(scheduleTotal(lines), 30000)
})

test('includeOptional pulls in optional items', () => {
  const lines = buildChargeSchedule([
    item({ label: 'Tuition', amount_ksh: 30000, is_required: true }),
    item({ label: 'Trip', amount_ksh: 5000, is_required: false }),
  ], { includeOptional: true })
  assert.equal(lines.length, 2)
  assert.equal(scheduleTotal(lines), 35000)
})

test('zero / negative amounts are dropped', () => {
  const lines = buildChargeSchedule([
    item({ label: 'Tuition', amount_ksh: 20000 }),
    item({ label: 'Waived', amount_ksh: 0 }),
    item({ label: 'Bad', amount_ksh: -100 }),
  ])
  assert.deepEqual(lines.map((l) => l.label), ['Tuition'])
})

test('amounts are rounded to the cent', () => {
  const lines = buildChargeSchedule([item({ amount_ksh: 1999.559 })])
  assert.equal(lines[0].amount_ksh, 1999.56)
  assert.equal(scheduleTotal(lines), 1999.56)
})

test('carries category_id and cadence through', () => {
  const [line] = buildChargeSchedule([item({ category_id: 'cat-1', billing_cadence: 'annual' })])
  assert.equal(line.category_id, 'cat-1')
  assert.equal(line.billing_cadence, 'annual')
})

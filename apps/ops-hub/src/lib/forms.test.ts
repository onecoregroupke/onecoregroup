import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertOwnEditable, coerceValues, fieldsChanged, templateInScope } from './forms'
import type { OcgFormFieldDef, OcgFormSubmissionRow, OcgFormTemplateRow } from '@ocg/db'

test('unrestricted scope (null) sees every form', () => {
  assert.equal(templateInScope('brand-A', null), true)
  assert.equal(templateInScope(null, null), true)
})

test('group-wide forms (no brand_id) are visible to every scope', () => {
  assert.equal(templateInScope(null, ['brand-A']), true)
})

test('a brand-scoped viewer sees only their brands (no cross-brand leak)', () => {
  assert.equal(templateInScope('brand-A', ['brand-A', 'brand-B']), true)
  assert.equal(templateInScope('brand-C', ['brand-A', 'brand-B']), false)
})

// ─── Value coercion ─────────────────────────────────────────────────────────

const FIELDS: OcgFormFieldDef[] = [
  { key: 'supplier', label: 'Supplier', type: 'text', required: true },
  { key: 'qty', label: 'Quantity', type: 'number', required: false },
  { key: 'damaged', label: 'Damaged?', type: 'checkbox', required: false },
]

test('a half-finished draft saves without tripping required fields', () => {
  const values = coerceValues(FIELDS, { qty: '5' }, { requireAll: false })
  assert.equal(values.supplier, '')
  assert.equal(values.qty, 5)
  assert.equal(values.damaged, false)
})

test('submission enforces required fields', () => {
  assert.throws(
    () => coerceValues(FIELDS, { qty: '5' }, { requireAll: true }),
    /Supplier is required/,
  )
})

test('unknown keys are dropped — a respondent cannot inject fields', () => {
  const values = coerceValues(FIELDS, { supplier: 'Acme', sneaky_total: '999999' }, { requireAll: true })
  assert.deepEqual(Object.keys(values).sort(), ['damaged', 'qty', 'supplier'])
  assert.equal('sneaky_total' in values, false)
})

test('checkbox coercion accepts the three truthy wire forms', () => {
  for (const raw of [true, 'true', 'on']) {
    assert.equal(coerceValues(FIELDS, { supplier: 'A', damaged: raw }, { requireAll: true }).damaged, true)
  }
  assert.equal(coerceValues(FIELDS, { supplier: 'A', damaged: 'no' }, { requireAll: true }).damaged, false)
})

// ─── Structure-change detection (version bump trigger) ──────────────────────

test('fieldsChanged detects a renamed question and an added field', () => {
  const renamed: OcgFormFieldDef[] = [{ ...FIELDS[0], label: 'Supplier name' }, FIELDS[1], FIELDS[2]]
  assert.equal(fieldsChanged(FIELDS, renamed), true)
  assert.equal(fieldsChanged(FIELDS, [...FIELDS, { key: 'x', label: 'X', type: 'text' }]), true)
  assert.equal(fieldsChanged(FIELDS, [...FIELDS]), false)
})

// ─── Respondent edit rights ─────────────────────────────────────────────────

function template(over: Partial<OcgFormTemplateRow> = {}): OcgFormTemplateRow {
  return { allow_self_correction: false, ...over } as OcgFormTemplateRow
}
function submission(over: Partial<OcgFormSubmissionRow> = {}): OcgFormSubmissionRow {
  return { submitted_by: 'shamim@onecoregroup.co.ke', status: 'draft', ...over } as OcgFormSubmissionRow
}

const OWNER = 'shamim@onecoregroup.co.ke'
const OTHER = 'manager@onecoregroup.co.ke'

test('a respondent may edit their own draft', () => {
  assert.doesNotThrow(() => assertOwnEditable(submission(), OWNER, template()))
})

test("a respondent may never edit someone else's entry", () => {
  assert.throws(() => assertOwnEditable(submission(), OTHER, template()), /only edit your own/)
})

test('ownership check is case-insensitive on email', () => {
  assert.doesNotThrow(() => assertOwnEditable(submission(), 'Shamim@OneCoreGroup.co.ke', template()))
})

test('a submitted entry is locked unless the form allows self-correction', () => {
  assert.throws(
    () => assertOwnEditable(submission({ status: 'submitted' }), OWNER, template()),
    /can no longer be edited/,
  )
  assert.doesNotThrow(() =>
    assertOwnEditable(submission({ status: 'submitted' }), OWNER, template({ allow_self_correction: true })),
  )
})

test('an entry sent back for correction reopens for its author', () => {
  assert.doesNotThrow(() => assertOwnEditable(submission({ status: 'correction_requested' }), OWNER, template()))
})

test('an approved entry is closed even to its author, even with self-correction on', () => {
  assert.throws(
    () => assertOwnEditable(submission({ status: 'approved' }), OWNER, template({ allow_self_correction: true })),
    /can no longer be edited/,
  )
})

test('a rejected entry is closed to its author', () => {
  assert.throws(
    () => assertOwnEditable(submission({ status: 'rejected' }), OWNER, template({ allow_self_correction: true })),
    /can no longer be edited/,
  )
})

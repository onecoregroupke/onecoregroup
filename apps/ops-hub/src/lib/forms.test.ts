import { test } from 'node:test'
import assert from 'node:assert/strict'
import { templateInScope } from './forms'

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

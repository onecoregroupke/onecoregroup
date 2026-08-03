import { test } from 'node:test'
import assert from 'node:assert/strict'
import { importTypesForBrand, importTypeAllowedForBrand, schoolForBrandSlug, isSchoolBrand } from './brandScope'

test('NPT must NOT be offered student / school-fee imports (§3)', () => {
  const npt = importTypesForBrand('nairobi-piano-technicians').map((t) => t.value)
  assert.ok(!npt.includes('school-ledger'), 'NPT should not have school-ledger')
  assert.ok(npt.includes('petty-cash'))
  assert.equal(importTypeAllowedForBrand('nairobi-piano-technicians', 'school-ledger'), false)
})

test('school brands get the student fee ledger + petty cash', () => {
  for (const slug of ['ar-rayyan-playhouse', 'rhythms-college', 'darul-swafa']) {
    const types = importTypesForBrand(slug).map((t) => t.value)
    assert.ok(types.includes('school-ledger'), `${slug} should have school-ledger`)
    assert.ok(types.includes('petty-cash'))
    assert.equal(importTypeAllowedForBrand(slug, 'school-ledger'), true)
  }
})

test('other non-school brands get petty cash only', () => {
  for (const slug of ['glitz-n-glim', 'nuuranest-stays', undefined]) {
    assert.deepEqual(importTypesForBrand(slug).map((t) => t.value), ['petty-cash'])
  }
})

test('school is derived from the brand slug', () => {
  assert.equal(schoolForBrandSlug('ar-rayyan-playhouse'), 'rayyan')
  assert.equal(schoolForBrandSlug('rhythms-college'), 'rhythms')
  assert.equal(schoolForBrandSlug('nairobi-piano-technicians'), null)
  assert.equal(isSchoolBrand('darul-swafa'), true)
  assert.equal(isSchoolBrand('glitz-n-glim'), false)
})

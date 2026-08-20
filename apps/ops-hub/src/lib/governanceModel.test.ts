import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertImportTransition, canAccessEmployee, canApproveImport, canLockImport,
  hasAuthority, importIdempotencyKey, initialKnowledgeStatus,
} from './governanceModel'

test('brand and department record scope prevents direct-id cross-entity access', () => {
  const actor = { memberId: 'a', department: 'Finance', brandIds: ['brand-a'], scope: 'department' as const }
  assert.equal(canAccessEmployee(actor, { memberId: 'b', department: 'Finance', brandIds: ['brand-a'] }), true)
  assert.equal(canAccessEmployee(actor, { memberId: 'c', department: 'Finance', brandIds: ['brand-b'] }), false)
  assert.equal(canAccessEmployee(actor, { memberId: 'd', department: 'Stores', brandIds: ['brand-a'] }), false)
})

test('own record scope never opens another employee by changing the URL id', () => {
  const actor = { memberId: 'a', department: 'Ops', brandIds: null, scope: 'own' as const }
  assert.equal(canAccessEmployee(actor, { memberId: 'a', department: 'Ops', brandIds: [] }), true)
  assert.equal(canAccessEmployee(actor, { memberId: 'b', department: 'Ops', brandIds: [] }), false)
})

test('capability does not imply approval authority', () => {
  const capabilities = [{ code: 'stock-count', active: true }]
  assert.equal(capabilities[0]?.active, true)
  assert.equal(hasAuthority([], 'approve', { brandId: 'brand-a', onDate: '2026-08-20' }), false)
  assert.equal(hasAuthority([{
    authority_action: 'approve', brand_id: 'brand-a', operational_area: 'inventory',
    active: true, effective_from: '2026-01-01', effective_until: null,
  }], 'approve', { brandId: 'brand-a', operationalArea: 'inventory', onDate: '2026-08-20' }), true)
})

test('legacy knowledge never defaults to current approved policy', () => {
  assert.equal(initialKnowledgeStatus('legacy'), 'legacy')
  assert.equal(initialKnowledgeStatus('historical'), 'legacy')
  assert.equal(initialKnowledgeStatus('live'), 'draft')
})

test('import workflow blocks premature posting and locking', () => {
  assert.throws(() => assertImportTransition('parsed', 'posted'))
  assert.doesNotThrow(() => assertImportTransition('ready_for_review', 'approved'))
  assert.equal(canApproveImport({ fatalExceptions: 0, openErrors: 0, validRows: 3 }), true)
  assert.equal(canApproveImport({ fatalExceptions: 1, openErrors: 0, validRows: 3 }), false)
  assert.equal(canLockImport({ status: 'posted', failedReconciliations: 0, pendingReconciliations: 0 }), false)
  assert.equal(canLockImport({ status: 'reconciled', failedReconciliations: 0, pendingReconciliations: 0 }), true)
})

test('import idempotency key is stable and period-sensitive', () => {
  const a = importIdempotencyKey({ brandId: 'b', importType: 'stock', fileHash: 'hash', periodStart: '2026-07-01', periodEnd: '2026-07-31' })
  const retry = importIdempotencyKey({ brandId: 'b', importType: 'stock', fileHash: 'hash', periodStart: '2026-07-01', periodEnd: '2026-07-31' })
  const august = importIdempotencyKey({ brandId: 'b', importType: 'stock', fileHash: 'hash', periodStart: '2026-08-01', periodEnd: '2026-08-31' })
  assert.equal(a, retry)
  assert.notEqual(a, august)
})


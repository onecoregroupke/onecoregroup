import test from 'node:test'
import assert from 'node:assert/strict'
import { knowledgeEntryInScope } from './knowledge'
import type { KnowledgeEntryRow } from '@ocg/db'

function entry(overrides: Partial<KnowledgeEntryRow> = {}): KnowledgeEntryRow {
  return {
    id: 'entry-1', title: 'Test', brand_id: 'brand-a', department: 'Finance',
    operational_area: '', knowledge_type: 'policy', owner_member_id: 'member-1',
    visibility_scope: 'management', tags: [], current_version_id: null,
    created_by: 'tester', created_at: '', updated_at: '',
    ...overrides,
  }
}

test('group/management scope can open any entry within their allowed brands', () => {
  assert.equal(knowledgeEntryInScope(entry(), {
    allowedBrands: null, recordScope: 'group', memberDepartment: null, memberId: null,
  }), true)
  assert.equal(knowledgeEntryInScope(entry(), {
    allowedBrands: ['brand-a'], recordScope: 'management', memberDepartment: null, memberId: null,
  }), true)
})

test('a brand-restricted user cannot open another entity\'s entry by changing the URL id', () => {
  assert.equal(knowledgeEntryInScope(entry({ brand_id: 'brand-b' }), {
    allowedBrands: ['brand-a'], recordScope: 'management', memberDepartment: null, memberId: null,
  }), false)
})

test('department scope only opens entries in the same department', () => {
  const opts = { allowedBrands: null, recordScope: 'department' as const, memberDepartment: 'Finance', memberId: null }
  assert.equal(knowledgeEntryInScope(entry({ department: 'Finance' }), opts), true)
  assert.equal(knowledgeEntryInScope(entry({ department: 'Stores' }), opts), false)
})

test('own scope only opens entries this member owns', () => {
  const opts = { allowedBrands: null, recordScope: 'own' as const, memberDepartment: null, memberId: 'member-1' }
  assert.equal(knowledgeEntryInScope(entry({ owner_member_id: 'member-1' }), opts), true)
  assert.equal(knowledgeEntryInScope(entry({ owner_member_id: 'member-2' }), opts), false)
})

test('a group-scoped (no brand) entry stays outside a brand-restricted user\'s reach', () => {
  assert.equal(knowledgeEntryInScope(entry({ brand_id: null }), {
    allowedBrands: ['brand-a'], recordScope: 'management', memberDepartment: null, memberId: null,
  }), false)
})

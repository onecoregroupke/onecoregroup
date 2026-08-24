import test from 'node:test'
import assert from 'node:assert/strict'
import {
  knowledgeEntryInScope, visibilityAllowed, matchesKnowledgeFilter, filterKnowledge,
  knowledgeFilterCounts, parseKnowledgeFilter, recordStatus,
  type KnowledgeRecord,
} from './knowledge'
import { hasAuthority, type AuthorityGrant } from './governanceModel'
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
  assert.equal(knowledgeEntryInScope(entry({ department: 'Finance', visibility_scope: 'department' }), opts), true)
  assert.equal(knowledgeEntryInScope(entry({ department: 'Stores', visibility_scope: 'department' }), opts), false)
})

test('own scope only opens entries this member owns, within a band they can reach', () => {
  // §51 changed this: ownership no longer lifts the visibility band, so the
  // entry must ALSO be in a band an own-scope reader can reach.
  const opts = { allowedBrands: null, recordScope: 'own' as const, memberDepartment: null, memberId: 'member-1' }
  assert.equal(knowledgeEntryInScope(entry({ owner_member_id: 'member-1', visibility_scope: 'own' }), opts), true)
  assert.equal(knowledgeEntryInScope(entry({ owner_member_id: 'member-2', visibility_scope: 'own' }), opts), false)
})

test('a group-scoped (no brand) entry stays outside a brand-restricted user\'s reach', () => {
  assert.equal(knowledgeEntryInScope(entry({ brand_id: null }), {
    allowedBrands: ['brand-a'], recordScope: 'management', memberDepartment: null, memberId: null,
  }), false)
})

// ─── §34 visibility_scope hierarchy ─────────────────────────────────────────

test('the visibility ladder runs own < department < management < group', () => {
  assert.equal(visibilityAllowed('own', 'own'), true)
  assert.equal(visibilityAllowed('department', 'own'), false)
  assert.equal(visibilityAllowed('department', 'department'), true)
  assert.equal(visibilityAllowed('management', 'department'), false)
  assert.equal(visibilityAllowed('management', 'management'), true)
  assert.equal(visibilityAllowed('group', 'management'), false)
  assert.equal(visibilityAllowed('group', 'group'), true)
})

test('an unrecognised visibility band is treated as the most restricted', () => {
  assert.equal(visibilityAllowed('something-new', 'management'), false)
  assert.equal(visibilityAllowed('something-new', 'group'), true)
})

test('a department reader cannot direct-open a MANAGEMENT document in their own department', () => {
  // The URL-guessing case §34 names: same department, higher band.
  assert.equal(knowledgeEntryInScope(entry({ department: 'Finance', visibility_scope: 'management' }), {
    allowedBrands: null, recordScope: 'department', memberDepartment: 'Finance', memberId: null,
  }), false)
})

test('a management reader cannot direct-open a GROUP-visibility document', () => {
  assert.equal(knowledgeEntryInScope(entry({ visibility_scope: 'group' }), {
    allowedBrands: null, recordScope: 'management', memberDepartment: null, memberId: null,
  }), false)
})

test('a group reader can open a group-visibility document', () => {
  assert.equal(knowledgeEntryInScope(entry({ visibility_scope: 'group' }), {
    allowedBrands: null, recordScope: 'group', memberDepartment: null, memberId: null,
  }), true)
})

test('an own-visibility document is not opened by a colleague in the same department', () => {
  assert.equal(knowledgeEntryInScope(entry({ visibility_scope: 'own', owner_member_id: 'member-9' }), {
    allowedBrands: null, recordScope: 'department', memberDepartment: 'Finance', memberId: 'member-1',
  }), true) // department horizon ≥ own band, and the department matches
  assert.equal(knowledgeEntryInScope(entry({ visibility_scope: 'own', owner_member_id: 'member-9', department: 'Stores' }), {
    allowedBrands: null, recordScope: 'department', memberDepartment: 'Finance', memberId: 'member-1',
  }), false)
})

// ─── §51: ownership is stewardship, not clearance ───────────────────────────

test('an owner does NOT bypass a higher visibility band', () => {
  // The corrected rule. Being named as the owner of a group-band document does
  // not give an own-scope account clearance to read it — the fix for that
  // situation is to raise the person's record horizon deliberately.
  assert.equal(knowledgeEntryInScope(entry({ visibility_scope: 'group', owner_member_id: 'member-1' }), {
    allowedBrands: null, recordScope: 'own', memberDepartment: null, memberId: 'member-1',
  }), false)
})

test('an owner does not bypass a management band either', () => {
  assert.equal(knowledgeEntryInScope(entry({ visibility_scope: 'management', owner_member_id: 'member-1' }), {
    allowedBrands: null, recordScope: 'own', memberDepartment: null, memberId: 'member-1',
  }), false)
})

test('an owner reaches their entry INSIDE a band they are allowed', () => {
  // Ordinary owner semantics still operate within the visibility they can reach.
  assert.equal(knowledgeEntryInScope(entry({ visibility_scope: 'own', owner_member_id: 'member-1' }), {
    allowedBrands: null, recordScope: 'own', memberDepartment: null, memberId: 'member-1',
  }), true)
})

test('a department reader reaches a document they own in another department', () => {
  assert.equal(knowledgeEntryInScope(
    entry({ visibility_scope: 'department', owner_member_id: 'member-1', department: 'Stores' }),
    { allowedBrands: null, recordScope: 'department', memberDepartment: 'Finance', memberId: 'member-1' },
  ), true)
})

test('ownership never overrides the BRAND boundary', () => {
  assert.equal(knowledgeEntryInScope(
    entry({ brand_id: 'brand-b', owner_member_id: 'member-1', visibility_scope: 'own' }),
    { allowedBrands: ['brand-a'], recordScope: 'group', memberDepartment: null, memberId: 'member-1' },
  ), false)
})

test('the list filter and the detail gate are the same predicate', () => {
  // Guards §34's "list, detail route and API must agree": if this ever diverges,
  // listKnowledge() and the [entryId] page would disagree about one row.
  const row = entry({ visibility_scope: 'group' })
  const opts = { allowedBrands: null, recordScope: 'management' as const, memberDepartment: null, memberId: null }
  const listWouldShow = [row].filter((e) => knowledgeEntryInScope(e, opts)).length > 0
  const detailWouldOpen = knowledgeEntryInScope(row, opts)
  assert.equal(listWouldShow, detailWouldOpen)
})

// ─── §§35–36 authority scope + group approval ───────────────────────────────

function grant(over: Partial<AuthorityGrant> = {}): AuthorityGrant {
  return {
    authority_action: 'approve', brand_id: 'brand-a', operational_area: 'knowledge',
    active: true, effective_from: '2026-01-01', effective_until: null,
    authority_scope: 'entity',
    ...over,
  }
}

test('a brand approver may approve that brand\'s knowledge', () => {
  assert.equal(hasAuthority([grant()], 'approve', {
    brandId: 'brand-a', operationalArea: 'knowledge', requiredScope: 'entity',
  }), true)
})

test('a brand approver may NOT approve another brand\'s knowledge', () => {
  assert.equal(hasAuthority([grant({ brand_id: 'brand-b' })], 'approve', {
    brandId: 'brand-a', operationalArea: 'knowledge', requiredScope: 'entity',
  }), false)
})

test('a brand-specific approver cannot publish GROUP knowledge', () => {
  // §36 exactly: brand_id NULL on the entry, brand-scoped grant on the approver.
  assert.equal(hasAuthority([grant({ brand_id: 'brand-a', authority_scope: 'group' })], 'approve', {
    brandId: null, operationalArea: 'knowledge', requiredScope: 'group',
  }), false)
})

test('an unrestricted group-scope approver can publish group knowledge', () => {
  assert.equal(hasAuthority([grant({ brand_id: null, authority_scope: 'group' })], 'approve', {
    brandId: null, operationalArea: 'knowledge', requiredScope: 'group',
  }), true)
})

test('an entity-scope grant does not reach a group decision', () => {
  assert.equal(hasAuthority([grant({ brand_id: null, authority_scope: 'entity' })], 'approve', {
    brandId: null, operationalArea: 'knowledge', requiredScope: 'group',
  }), false)
})

test('authority_scope is enforced, not merely stored', () => {
  const weak = grant({ authority_scope: 'own' })
  assert.equal(hasAuthority([weak], 'approve', { brandId: 'brand-a', requiredScope: 'entity' }), false)
  assert.equal(hasAuthority([weak], 'approve', { brandId: 'brand-a', requiredScope: 'own' }), true)
})

test('a wider scope satisfies a narrower requirement', () => {
  assert.equal(hasAuthority([grant({ authority_scope: 'group' })], 'approve', {
    brandId: 'brand-a', requiredScope: 'entity',
  }), true)
})

test('an inactive, expired or not-yet-effective grant confers nothing', () => {
  assert.equal(hasAuthority([grant({ active: false })], 'approve', { brandId: 'brand-a' }), false)
  assert.equal(hasAuthority([grant({ effective_until: '2020-01-01' })], 'approve', {
    brandId: 'brand-a', onDate: '2026-08-24',
  }), false)
  assert.equal(hasAuthority([grant({ effective_from: '2030-01-01' })], 'approve', {
    brandId: 'brand-a', onDate: '2026-08-24',
  }), false)
})

test('an approval grant in another operational area does not approve knowledge', () => {
  assert.equal(hasAuthority([grant({ operational_area: 'finance' })], 'approve', {
    brandId: 'brand-a', operationalArea: 'knowledge',
  }), false)
})

test('a "review" grant is not an "approve" grant', () => {
  assert.equal(hasAuthority([grant({ authority_action: 'review' })], 'approve', {
    brandId: 'brand-a', operationalArea: 'knowledge',
  }), false)
})

test('an editor holding no approval grant cannot publish anything', () => {
  assert.equal(hasAuthority([], 'approve', { brandId: 'brand-a', operationalArea: 'knowledge' }), false)
  assert.equal(hasAuthority([], 'approve', { brandId: null, operationalArea: 'knowledge' }), false)
})

// ─── §36: archived Knowledge is history, not library ───────────────────

function version(status: string, no = 1) {
  return {
    id: `v${no}-${status}`, entry_id: 'entry-1', version_no: no, status,
    content_body: '', file_url: '', file_hash: '', source_title: '', source_type: '',
    source_date: null, source_reference: '', effective_from: null, effective_until: null,
    review_date: null, approved_by: '', approved_at: null, change_summary: '',
    supersedes_version_id: null, created_by: '', created_at: '',
  }
}

function record(statuses: string[], current?: string): KnowledgeRecord {
  const versions = statuses.map((s, i) => version(s, statuses.length - i))
  return {
    ...entry(),
    versions,
    currentVersion: current ? versions.find((v) => v.status === current) ?? null : null,
  } as KnowledgeRecord
}

test('the default library shows current, draft and legacy knowledge', () => {
  assert.equal(matchesKnowledgeFilter(record(['current'], 'current'), 'active'), true)
  assert.equal(matchesKnowledgeFilter(record(['draft']), 'active'), true)
  assert.equal(matchesKnowledgeFilter(record(['legacy']), 'active'), true)
})

test('an archived-only record is excluded from the default library', () => {
  // The exact defect: two archived smoke records rendered in the working list.
  assert.equal(matchesKnowledgeFilter(record(['archived']), 'active'), false)
  assert.equal(matchesKnowledgeFilter(record(['archived', 'archived']), 'active'), false)
})

test('archived business history remains reachable under the Archived view', () => {
  assert.equal(matchesKnowledgeFilter(record(['archived']), 'archived'), true)
})

test('a record with a live current version is not hidden by an old archived one', () => {
  const mixed = record(['current', 'archived'], 'current')
  assert.equal(matchesKnowledgeFilter(mixed, 'active'), true)
  // It still appears under Archived, because it does have archived history.
  assert.equal(matchesKnowledgeFilter(mixed, 'archived'), true)
})

test('the Drafts view shows drafts and excludes archived-only records', () => {
  assert.equal(matchesKnowledgeFilter(record(['draft']), 'drafts'), true)
  assert.equal(matchesKnowledgeFilter(record(['current'], 'current'), 'drafts'), false)
  assert.equal(matchesKnowledgeFilter(record(['archived']), 'drafts'), false)
})

test('the Legacy view shows legacy reference material only', () => {
  assert.equal(matchesKnowledgeFilter(record(['legacy']), 'legacy'), true)
  assert.equal(matchesKnowledgeFilter(record(['draft']), 'legacy'), false)
})

test('filtering a library keeps archived-only records out by default', () => {
  const records = [record(['current'], 'current'), record(['archived']), record(['draft'])]
  assert.equal(filterKnowledge(records, 'active').length, 2)
  assert.equal(filterKnowledge(records, 'archived').length, 1)
})

test('filter counts describe what each view would actually show', () => {
  const records = [record(['current'], 'current'), record(['archived']), record(['draft'])]
  const counts = knowledgeFilterCounts(records)
  assert.equal(counts.active, 2)
  assert.equal(counts.archived, 1)
  assert.equal(counts.drafts, 1)
})

test('an unknown filter value falls back to the working library', () => {
  assert.equal(parseKnowledgeFilter('archived'), 'archived')
  assert.equal(parseKnowledgeFilter('ARCHIVED'), 'archived')
  assert.equal(parseKnowledgeFilter(null), 'active')
  assert.equal(parseKnowledgeFilter('nonsense'), 'active')
})

test('a record presents the status of its current version, else its newest', () => {
  assert.equal(recordStatus(record(['current', 'draft'], 'current')), 'current')
  assert.equal(recordStatus(record(['draft'])), 'draft')
})

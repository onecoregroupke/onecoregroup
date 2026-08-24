import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canReview, actionableReviews, describeReviewState, formatReviewDate,
  validateReopenComment, reviewScope, isReviewDecision,
  type Reviewer, type ReviewSubject,
} from './reviewAuthority'

const BRAND_GLITZ = '11111111-1111-1111-1111-111111111111'
const BRAND_NPT = '22222222-2222-2222-2222-222222222222'

const EMPLOYEE_A = 'member-employee-a'
const REVIEWER_B = 'member-reviewer-b'
const MANAGER_C = 'member-manager-c'

/** A manager who holds the review capability, optionally brand-scoped. */
function manager(id: string, brands?: string[]): Reviewer {
  return {
    teamMemberId: id,
    name: `Manager ${id}`,
    permissions: { duties_review: 'view' },
    brandAccess: brands ? { duties_review: brands, duties_all: brands, duties: brands } : {},
  }
}

/** An ordinary employee: no review capability at all. */
function employee(id: string, name = 'Employee'): Reviewer {
  return { teamMemberId: id, name, permissions: {}, brandAccess: {} }
}

const foundingAdmin: Reviewer = {
  teamMemberId: 'member-founder', name: 'Founder', permissions: null, brandAccess: null,
}

function subject(overrides: Partial<ReviewSubject> = {}): ReviewSubject {
  return {
    reviewerId: null,
    submitterMemberId: EMPLOYEE_A,
    submitterName: 'Employee A',
    brandId: BRAND_GLITZ,
    ...overrides,
  }
}

// ─── Named reviewer (§12) ───────────────────────────────────────────────────

test('the named reviewer may accept', () => {
  const verdict = canReview(manager(REVIEWER_B), subject({ reviewerId: REVIEWER_B }))
  assert.equal(verdict.allowed, true)
})

test('the named reviewer may accept even without a broad review grant', () => {
  // Being named IS the authority — it does not additionally require the
  // duties_review section, or a named line manager could not sign off.
  const named: Reviewer = { teamMemberId: REVIEWER_B, name: 'B', permissions: {}, brandAccess: {} }
  assert.equal(canReview(named, subject({ reviewerId: REVIEWER_B })).allowed, true)
})

test('an unrelated manager cannot accept a named-reviewer duty', () => {
  const verdict = canReview(manager(MANAGER_C), subject({ reviewerId: REVIEWER_B }))
  assert.equal(verdict.allowed, false)
  assert.equal(verdict.refusal, 'named_reviewer')
})

test('an unrelated manager cannot reopen a named-reviewer duty either', () => {
  // Accept and reopen share one predicate, so this is the same call — which is
  // exactly the property being asserted.
  assert.equal(canReview(manager(MANAGER_C), subject({ reviewerId: REVIEWER_B })).allowed, false)
})

test('a founding admin does NOT bypass a named reviewer', () => {
  const verdict = canReview(foundingAdmin, subject({ reviewerId: REVIEWER_B }))
  assert.equal(verdict.allowed, false)
  assert.equal(verdict.refusal, 'named_reviewer')
})

test('an account with no team-member row can never be the named reviewer', () => {
  const ghost: Reviewer = { teamMemberId: null, name: 'Ghost', permissions: null, brandAccess: null }
  assert.equal(canReview(ghost, subject({ reviewerId: REVIEWER_B })).refusal, 'no_identity')
})

test('the refusal message never names the reserved reviewer', () => {
  const verdict = canReview(manager(MANAGER_C), subject({ reviewerId: REVIEWER_B }))
  assert.equal(verdict.message.includes(REVIEWER_B), false)
})

test('an unrelated manager does not receive a named-reviewer item as actionable', () => {
  const rows = [
    subject({ reviewerId: REVIEWER_B }),
    subject({ reviewerId: null }),
  ]
  const forC = actionableReviews(manager(MANAGER_C), rows)
  assert.equal(forC.length, 1)
  assert.equal(forC[0]!.reviewerId, null)

  const forB = actionableReviews(manager(REVIEWER_B), rows)
  assert.equal(forB.length, 2)
})

// ─── Unnamed reviewer (§12) ─────────────────────────────────────────────────

test('reviewer_id = NULL permits a correctly scoped eligible manager', () => {
  assert.equal(canReview(manager(MANAGER_C), subject({ reviewerId: null })).allowed, true)
})

test('reviewer_id = NULL still refuses someone with no review capability', () => {
  const verdict = canReview(employee('member-x'), subject({ reviewerId: null }))
  assert.equal(verdict.allowed, false)
  assert.equal(verdict.refusal, 'not_a_reviewer')
})

test('an out-of-brand-scope manager cannot review', () => {
  const nptManager = manager(MANAGER_C, [BRAND_NPT])
  const verdict = canReview(nptManager, subject({ reviewerId: null, brandId: BRAND_GLITZ }))
  assert.equal(verdict.allowed, false)
  assert.equal(verdict.refusal, 'out_of_scope')
})

test('an in-brand-scope manager can review', () => {
  const glitzManager = manager(MANAGER_C, [BRAND_GLITZ])
  assert.equal(canReview(glitzManager, subject({ reviewerId: null, brandId: BRAND_GLITZ })).allowed, true)
})

test('a brand-scoped manager cannot review group-level (brand-less) work', () => {
  const glitzManager = manager(MANAGER_C, [BRAND_GLITZ])
  assert.equal(canReview(glitzManager, subject({ reviewerId: null, brandId: null })).refusal, 'out_of_scope')
})

test('an unrestricted manager may review group-level work', () => {
  assert.equal(canReview(manager(MANAGER_C), subject({ reviewerId: null, brandId: null })).allowed, true)
})

// ─── Self-review (§13) ──────────────────────────────────────────────────────

test('an employee cannot review their own duty', () => {
  const self = { ...manager(EMPLOYEE_A) }
  const verdict = canReview(self, subject({ reviewerId: null, submitterMemberId: EMPLOYEE_A }))
  assert.equal(verdict.allowed, false)
  assert.equal(verdict.refusal, 'self_review')
})

test('self-review stays prohibited for a founding admin', () => {
  const verdict = canReview(
    foundingAdmin,
    subject({ reviewerId: null, submitterMemberId: 'member-founder' }),
  )
  assert.equal(verdict.refusal, 'self_review')
})

test('a named reviewer cannot countersign work they themselves did', () => {
  const verdict = canReview(
    manager(REVIEWER_B),
    subject({ reviewerId: REVIEWER_B, submitterMemberId: REVIEWER_B }),
  )
  assert.equal(verdict.refusal, 'self_review')
})

test('self-review is caught by name when the legacy row has no assignee id', () => {
  const reviewer: Reviewer = {
    teamMemberId: MANAGER_C, name: 'Fatma Ali',
    permissions: { duties_review: 'view' }, brandAccess: {},
  }
  const verdict = canReview(reviewer, subject({
    reviewerId: null, submitterMemberId: null, submitterName: 'fatma ali',
  }))
  assert.equal(verdict.refusal, 'self_review')
})

test('stable ids win over display names — a namesake is not treated as self', () => {
  const reviewer: Reviewer = {
    teamMemberId: MANAGER_C, name: 'John Mwangi',
    permissions: { duties_review: 'view' }, brandAccess: {},
  }
  const verdict = canReview(reviewer, subject({
    reviewerId: null, submitterMemberId: EMPLOYEE_A, submitterName: 'John Mwangi',
  }))
  assert.equal(verdict.allowed, true)
})

// ─── Scope helper ───────────────────────────────────────────────────────────

test('reviewScope is own (nothing actionable) without the review capability', () => {
  assert.deepEqual(
    reviewScope({ permissions: {}, brandAccess: {}, teamMemberId: 'x' }),
    { kind: 'own' },
  )
})

test('reviewScope is all for the founding admin', () => {
  assert.deepEqual(
    reviewScope({ permissions: null, brandAccess: null, teamMemberId: 'x' }),
    { kind: 'all' },
  )
})

// ─── Employee-facing status (§15) ───────────────────────────────────────────

test('pending names the reviewer the employee is waiting on', () => {
  const view = describeReviewState({ reviewState: 'pending', reviewerName: 'Fatma' })
  assert.equal(view.label, 'Pending review')
  assert.equal(view.detail, 'Awaiting review by Fatma')
})

test('pending stays honest when no reviewer is named', () => {
  const view = describeReviewState({ reviewState: 'pending', reviewerName: null })
  assert.equal(view.detail, 'Awaiting manager review')
})

test('accepted reads as a countersignature with who and when', () => {
  const view = describeReviewState({
    reviewState: 'accepted', reviewedBy: 'Fatma', reviewedAt: '2026-08-24T07:15:00Z',
  })
  assert.equal(view.label, 'Countersigned')
  assert.match(view.detail, /^Reviewed by Fatma · 24 Aug 2026 · 10:15$/)
})

test('reopened carries the correction the employee must act on', () => {
  const view = describeReviewState({
    reviewState: 'reopened', reviewedBy: 'Fatma',
    reviewComment: 'Please attach the closing stock sheet.',
  })
  assert.equal(view.label, 'Reopened')
  assert.match(view.detail, /Please attach the closing stock sheet\./)
})

test('not_required produces nothing to display', () => {
  assert.equal(describeReviewState({ reviewState: 'not_required' }).tone, 'none')
})

test('the countersign stamp renders in Kenyan time', () => {
  assert.equal(formatReviewDate('2026-08-24T07:15:00Z'), '24 Aug 2026 · 10:15')
})

test('an unparseable timestamp produces no stamp rather than "Invalid Date"', () => {
  assert.equal(formatReviewDate('not-a-date'), '')
})

// ─── Reopen reason (§16) ────────────────────────────────────────────────────

test('reopening requires a usable reason', () => {
  assert.notEqual(validateReopenComment(''), null)
  assert.notEqual(validateReopenComment('  '), null)
  assert.notEqual(validateReopenComment('no'), null)
  assert.equal(validateReopenComment('Attach the stock sheet'), null)
})

// ─── Task status transitions (§17) ──────────────────────────────────────────

test('signing off work sitting in the review queue is a review decision', () => {
  assert.equal(isReviewDecision('Submitted', 'Completed', false), true)
  assert.equal(isReviewDecision('Under Review', 'Completed', false), true)
  assert.equal(isReviewDecision('Submitted', 'Approved', false), true)
})

test('reopening is always a review decision', () => {
  assert.equal(isReviewDecision('Submitted', 'Reopened', false), true)
  assert.equal(isReviewDecision('Ongoing', 'Reopened', false), true)
})

test('an approval-gated task cannot be closed as ordinary progress', () => {
  assert.equal(isReviewDecision('Ongoing', 'Completed', true), true)
})

test('ordinary progress on an ungated task is NOT a review decision', () => {
  assert.equal(isReviewDecision('Not Started', 'Ongoing', false), false)
  assert.equal(isReviewDecision('Ongoing', 'Completed', false), false)
  assert.equal(isReviewDecision('Ongoing', 'Blocked', true), false)
})

test('an assignee may still submit an approval-gated task for review', () => {
  assert.equal(isReviewDecision('Ongoing', 'Submitted', true), false)
})

test('task and duty reviewer rules are the same predicate, not parallel ones', () => {
  // A named task reviewer behaves exactly like a named duty reviewer.
  const taskSubject = subject({ reviewerId: REVIEWER_B, brandId: BRAND_NPT })
  assert.equal(canReview(manager(REVIEWER_B), taskSubject).allowed, true)
  assert.equal(canReview(manager(MANAGER_C), taskSubject).refusal, 'named_reviewer')
})

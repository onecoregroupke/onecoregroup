import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateTaskCompletion, statusAfterSubmission, reviewStateAfterSubmission,
  statusAfterReview, canReviewSubmission, evidenceCount,
  summariseOperations, groupOperations, type OperationsEntry,
} from './completionReports'
import { isAwaitingReview, isActiveStatus, isTerminalStatus } from './taskStatuses'

// ─── Completion gating (§12) ────────────────────────────────────────────────

test('an ungated task accepts a bare completion', () => {
  assert.deepEqual(validateTaskCompletion({}, {}), [])
})

test('required note is satisfied by either summary or work_performed', () => {
  assert.equal(validateTaskCompletion({ requires_note: true }, {}).length, 1)
  assert.equal(validateTaskCompletion({ requires_note: true }, { summary: 'Done' }).length, 0)
  assert.equal(validateTaskCompletion({ requires_note: true }, { work_performed: 'Swept' }).length, 0)
  assert.equal(validateTaskCompletion({ requires_note: true }, { summary: '   ' }).length, 1)
})

test('evidence counts legacy file_urls and new attachments together', () => {
  assert.equal(evidenceCount({ file_urls: ['a'], attachment_count: 2 }), 3)
  assert.equal(validateTaskCompletion({ requires_evidence: true }, { file_urls: ['a'] }).length, 0)
  assert.equal(validateTaskCompletion({ requires_evidence: true }, { attachment_count: 1 }).length, 0)
  assert.equal(validateTaskCompletion({ requires_evidence: true }, {}).length, 1)
})

test('a partial checklist blocks completion', () => {
  const p = validateTaskCompletion({ requires_checklist: true }, { checklist_done: 1, checklist_total: 4 })
  assert.match(p[0], /All 4 checklist items/)
})

test('a checklist requirement with nothing configured is blocked, not passed', () => {
  const p = validateTaskCompletion({ requires_checklist: true }, { checklist_done: 0, checklist_total: 0 })
  assert.match(p[0], /none is configured/)
})

test('a required form must be submitted', () => {
  assert.equal(validateTaskCompletion({ required_form_template_id: 't' }, {}).length, 1)
  assert.equal(validateTaskCompletion({ required_form_template_id: 't' }, { form_submission_id: 's' }).length, 0)
})

test('negative time spent is rejected', () => {
  assert.equal(validateTaskCompletion({}, { time_spent_minutes: -5 }).length, 1)
  assert.equal(validateTaskCompletion({}, { time_spent_minutes: 0 }).length, 0)
})

test('all unmet requirements are reported together', () => {
  const p = validateTaskCompletion(
    { requires_note: true, requires_evidence: true, required_form_template_id: 't' }, {},
  )
  assert.equal(p.length, 3)
})

// ─── Review flow (§13) ──────────────────────────────────────────────────────

test('an approval-gated task is Submitted, never self-completed', () => {
  assert.equal(statusAfterSubmission({ requires_approval: true }), 'Submitted')
  assert.equal(reviewStateAfterSubmission({ requires_approval: true }), 'pending')
})

test('an ungated task completes directly', () => {
  assert.equal(statusAfterSubmission({}), 'Completed')
  assert.equal(reviewStateAfterSubmission({}), 'not_required')
})

test('review decisions map to the right status', () => {
  assert.equal(statusAfterReview('accepted'), 'Completed')
  assert.equal(statusAfterReview('reopened'), 'Reopened')
  assert.equal(statusAfterReview('cancelled'), 'Cancelled')
})

test('a reviewer cannot accept their own submitted work', () => {
  const sub = { submitted_by: 'Wallace' }
  assert.equal(canReviewSubmission({ name: 'Wallace', isManager: true }, sub), false)
  assert.equal(canReviewSubmission({ name: ' wallace ', isManager: true }, sub), false)
  assert.equal(canReviewSubmission({ name: 'Shamim', isManager: true }, sub), true)
})

test('a non-manager cannot review at all', () => {
  assert.equal(canReviewSubmission({ name: 'Shamim', isManager: false }, { submitted_by: 'Wallace' }), false)
})

// ─── Lifecycle helpers ──────────────────────────────────────────────────────

test('submitted and under-review are the review queue', () => {
  assert.equal(isAwaitingReview('Submitted'), true)
  assert.equal(isAwaitingReview('Under Review'), true)
  assert.equal(isAwaitingReview('Ongoing'), false)
  assert.equal(isAwaitingReview('Completed'), false)
})

test('cancelled is terminal and therefore not active', () => {
  assert.equal(isTerminalStatus('Cancelled'), true)
  assert.equal(isActiveStatus('Cancelled'), false)
})

test('a reopened task is active work again', () => {
  assert.equal(isActiveStatus('Reopened'), true)
  assert.equal(isTerminalStatus('Reopened'), false)
})

test('submitted work is still active until a manager accepts it', () => {
  assert.equal(isActiveStatus('Submitted'), true)
})

// ─── Daily operations summary (§14) ─────────────────────────────────────────

const entries: OperationsEntry[] = [
  { entry_type: 'task', entry_date: '2026-08-05', employee: 'Wallace', brand_id: 'g', department: 'Operations', category: 'Ops', completion_status: 'Completed', completed_at: 'x', review_state: 'not_required', evidence_count: 2, from_duty: false },
  { entry_type: 'task', entry_date: '2026-08-05', employee: 'Wallace', brand_id: 'g', department: 'Operations', category: 'Ops', completion_status: 'Completed', completed_at: 'x', review_state: 'pending', evidence_count: 0, from_duty: false },
  { entry_type: 'duty', entry_date: '2026-08-05', employee: 'Shamim', brand_id: 'g', department: 'Operations', category: '', completion_status: 'done', completed_at: 'x', review_state: 'not_required', evidence_count: 1, from_duty: true },
  { entry_type: 'duty', entry_date: '2026-08-05', employee: 'Shamim', brand_id: 'n', department: 'Finance', category: '', completion_status: 'skipped', completed_at: null, review_state: 'not_required', evidence_count: 0, from_duty: true },
  { entry_type: 'duty', entry_date: '2026-08-05', employee: 'Gumi', brand_id: 'n', department: 'Finance', category: '', completion_status: 'done', completed_at: 'x', review_state: 'reopened', evidence_count: 0, from_duty: true },
]

test('the manager summary counts tasks and duties separately', () => {
  const s = summariseOperations(entries)
  assert.equal(s.completed, 4)          // 2 tasks + 2 duties done
  assert.equal(s.tasksCompleted, 2)
  assert.equal(s.dutiesCompleted, 2)
  assert.equal(s.dutiesMissed, 1)       // the skipped one
  assert.equal(s.submittedForReview, 1)
  assert.equal(s.reopened, 1)
  assert.equal(s.withEvidence, 2)   // the task with 2 files, and the duty with 1
})

test('due and overdue counts come from the caller, not invented from entries', () => {
  // Entries only describe what HAPPENED; what was DUE is a different question,
  // so the summary must not silently guess it.
  const s = summariseOperations(entries, { totalDue: 12, overdue: 3, completedOnTime: 4 })
  assert.equal(s.totalDue, 12)
  assert.equal(s.overdue, 3)
  assert.equal(s.completedOnTime, 4)
})

test('an empty day summarises to zeros, not NaN', () => {
  const s = summariseOperations([])
  assert.equal(s.completed, 0)
  assert.equal(s.totalDue, 0)
  assert.equal(s.dutiesMissed, 0)
})

test('drill-down groups by brand, department and employee', () => {
  const byBrand = groupOperations(entries, 'brand_id')
  assert.deepEqual(byBrand.map((g) => [g.key, g.total]), [['g', 3], ['n', 2]])

  const byEmployee = groupOperations(entries, 'employee')
  const shamim = byEmployee.find((g) => g.key === 'Shamim')
  assert.equal(shamim?.total, 2)
  assert.equal(shamim?.completed, 1)   // one done, one skipped
})

test('missing group keys bucket to a placeholder rather than dropping rows', () => {
  const byCategory = groupOperations(entries, 'category')
  const total = byCategory.reduce((n, g) => n + g.total, 0)
  assert.equal(total, entries.length)
  assert.ok(byCategory.some((g) => g.key === '—'))
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveDutyAssignees, isDutyActiveOn, validateDutyCompletion, initialReviewState,
  wasCompletedOnTime, dutyDueAt, isOccurrenceOverdue, dutyCan, canAssignDutyInBrand,
  dutyScope, type TargetableMember,
} from './dutyModel'

const BRAND_GLITZ = '11111111-1111-1111-1111-111111111111'
const BRAND_NPT = '22222222-2222-2222-2222-222222222222'

const members: TargetableMember[] = [
  { id: 'm1', name: 'Shamim', email: 's@x.com', active: true, team: 'Compound', department: 'Operations', role: 'Supervisor', location: 'Nairobi HQ', brand_ids: [BRAND_GLITZ] },
  { id: 'm2', name: 'Wallace', email: 'w@x.com', active: true, team: 'Stores', department: 'Operations', role: 'Storekeeper', location: 'Nairobi HQ', brand_ids: [BRAND_GLITZ, BRAND_NPT] },
  { id: 'm3', name: 'Gumi', email: 'g@x.com', active: true, team: 'Stores', department: 'Finance', role: 'Accounts', location: 'Mombasa', brand_ids: [BRAND_NPT] },
  { id: 'm4', name: 'Former', email: 'f@x.com', active: false, team: 'Stores', department: 'Operations', role: 'Storekeeper', location: 'Nairobi HQ', brand_ids: [BRAND_GLITZ] },
]

// ─── Targeting ──────────────────────────────────────────────────────────────

test('employee targeting resolves to exactly that person', () => {
  const got = resolveDutyAssignees({ target_kind: 'employee', assignee_id: 'm1' }, members)
  assert.deepEqual(got.map((m) => m.name), ['Shamim'])
})

test('an unassigned employee duty targets NOBODY, never everybody', () => {
  const got = resolveDutyAssignees({ target_kind: 'employee', assignee_id: null }, members)
  assert.deepEqual(got, [])
})

test('team targeting resolves every active member of the team', () => {
  const got = resolveDutyAssignees({ target_kind: 'team', target_team: 'Stores' }, members)
  assert.deepEqual(got.map((m) => m.name), ['Wallace', 'Gumi'])
})

test('inactive members are never targeted', () => {
  const got = resolveDutyAssignees({ target_kind: 'team', target_team: 'Stores' }, members)
  assert.equal(got.some((m) => m.name === 'Former'), false)
})

test('department, role and location targeting', () => {
  assert.deepEqual(
    resolveDutyAssignees({ target_kind: 'department', target_department: 'Finance' }, members).map((m) => m.name),
    ['Gumi'],
  )
  assert.deepEqual(
    resolveDutyAssignees({ target_kind: 'role', target_role: 'Storekeeper' }, members).map((m) => m.name),
    ['Wallace'],
  )
  assert.deepEqual(
    resolveDutyAssignees({ target_kind: 'location', target_location: 'Mombasa' }, members).map((m) => m.name),
    ['Gumi'],
  )
})

test('targeting matching is case- and whitespace-insensitive', () => {
  const got = resolveDutyAssignees({ target_kind: 'team', target_team: '  stores ' }, members)
  assert.deepEqual(got.map((m) => m.name), ['Wallace', 'Gumi'])
})

test('a blank target matches nobody rather than everybody', () => {
  assert.deepEqual(resolveDutyAssignees({ target_kind: 'team', target_team: '' }, members), [])
  assert.deepEqual(resolveDutyAssignees({ target_kind: 'role', target_role: '   ' }, members), [])
})

test('brand targeting uses the member brand list', () => {
  assert.deepEqual(
    resolveDutyAssignees({ target_kind: 'brand', brand_id: BRAND_NPT }, members).map((m) => m.name),
    ['Wallace', 'Gumi'],
  )
})

// ─── Holiday policy ─────────────────────────────────────────────────────────

const MON = '2026-08-03' // Monday
const holidays = [{ holiday_date: MON, brand_id: null, is_working_day: false }]

test('a holiday only suppresses a duty that opted into skip_holidays', () => {
  assert.equal(isDutyActiveOn({ frequency: 'daily' }, MON, holidays), true)
  assert.equal(isDutyActiveOn({ frequency: 'daily', skip_holidays: true }, MON, holidays), false)
})

test('a declared working day overrides a same-date holiday', () => {
  const both = [
    { holiday_date: MON, brand_id: null, is_working_day: false },
    { holiday_date: MON, brand_id: null, is_working_day: true },
  ]
  assert.equal(isDutyActiveOn({ frequency: 'daily', skip_holidays: true }, MON, both), true)
})

test('a brand holiday does not suppress another brand’s duty', () => {
  const glitzOnly = [{ holiday_date: MON, brand_id: BRAND_GLITZ, is_working_day: false }]
  assert.equal(
    isDutyActiveOn({ frequency: 'daily', skip_holidays: true, brand_id: BRAND_NPT }, MON, glitzOnly),
    true,
  )
  assert.equal(
    isDutyActiveOn({ frequency: 'daily', skip_holidays: true, brand_id: BRAND_GLITZ }, MON, glitzOnly),
    false,
  )
})

// ─── Completion gating (§12) ────────────────────────────────────────────────

test('a duty with no requirements accepts a bare completion', () => {
  assert.deepEqual(validateDutyCompletion({}, { status: 'done' }), [])
})

test('required note blocks completion when blank', () => {
  const p = validateDutyCompletion({ requires_note: true }, { status: 'done', note: '   ' })
  assert.equal(p.length, 1)
  assert.match(p[0], /note is required/i)
})

test('required evidence blocks completion with no attachment', () => {
  assert.equal(validateDutyCompletion({ requires_proof: true }, { status: 'done', attachment_count: 0 }).length, 1)
  assert.equal(validateDutyCompletion({ requires_proof: true }, { status: 'done', attachment_count: 1 }).length, 0)
})

test('required checklist blocks a partial tick-off', () => {
  const p = validateDutyCompletion({ requires_checklist: true }, { status: 'done', checklist_done: 2, checklist_total: 5 })
  assert.equal(p.length, 1)
  assert.match(p[0], /All 5 checklist items/)
})

test('a checklist duty with no configured items is blocked, not silently passed', () => {
  const p = validateDutyCompletion({ requires_checklist: true }, { status: 'done', checklist_done: 0, checklist_total: 0 })
  assert.equal(p.length, 1)
  assert.match(p[0], /no checklist items configured/i)
})

test('required form blocks completion without a submission', () => {
  assert.equal(
    validateDutyCompletion({ required_form_template_id: 'tpl' }, { status: 'done' }).length, 1,
  )
  assert.equal(
    validateDutyCompletion({ required_form_template_id: 'tpl' }, { status: 'done', form_submission_id: 'sub' }).length, 0,
  )
})

test('every unmet requirement is reported at once', () => {
  const p = validateDutyCompletion(
    { requires_note: true, requires_proof: true, required_form_template_id: 'tpl' },
    { status: 'done' },
  )
  assert.equal(p.length, 3)
})

test('skipping a duty is never gated — that is how a miss gets recorded honestly', () => {
  const req = { requires_note: true, requires_proof: true, requires_checklist: true, required_form_template_id: 't' }
  assert.deepEqual(validateDutyCompletion(req, { status: 'skipped' }), [])
  assert.deepEqual(validateDutyCompletion(req, { status: 'pending' }), [])
})

// ─── Review (§13) ───────────────────────────────────────────────────────────

test('review state is pending only when approval is required and work is done', () => {
  assert.equal(initialReviewState({ requires_approval: true }, 'done'), 'pending')
  assert.equal(initialReviewState({ requires_approval: false }, 'done'), 'not_required')
  assert.equal(initialReviewState({ requires_approval: true }, 'skipped'), 'not_required')
})

// ─── Timing ─────────────────────────────────────────────────────────────────

test('dutyDueAt builds the EAT instant from a wall-clock time', () => {
  assert.equal(dutyDueAt('2026-08-03', '08:30'), '2026-08-03T05:30:00.000Z')
})

test('dutyDueAt returns null for an unset or malformed time', () => {
  assert.equal(dutyDueAt('2026-08-03', ''), null)
  assert.equal(dutyDueAt('2026-08-03', '8:30'), null)
})

test('on-time honours the grace period', () => {
  const due = '2026-08-03T05:30:00.000Z'
  assert.equal(wasCompletedOnTime(due, '2026-08-03T05:29:00.000Z'), true)
  assert.equal(wasCompletedOnTime(due, '2026-08-03T05:40:00.000Z'), false)
  assert.equal(wasCompletedOnTime(due, '2026-08-03T05:40:00.000Z', 15), true)
})

test('an incomplete occurrence has no on-time verdict', () => {
  assert.equal(wasCompletedOnTime('2026-08-03T05:30:00.000Z', null), null)
})

test('with no due time a completion is on time', () => {
  assert.equal(wasCompletedOnTime(null, '2026-08-03T23:00:00.000Z'), true)
})

test('overdue needs a due instant, an incomplete status, and elapsed grace', () => {
  const due = '2026-08-03T05:30:00.000Z'
  assert.equal(isOccurrenceOverdue(due, 'pending', '2026-08-03T06:00:00.000Z'), true)
  assert.equal(isOccurrenceOverdue(due, 'pending', '2026-08-03T06:00:00.000Z', 60), false)
  assert.equal(isOccurrenceOverdue(due, 'done', '2026-08-03T06:00:00.000Z'), false)
  assert.equal(isOccurrenceOverdue(due, 'skipped', '2026-08-03T06:00:00.000Z'), false)
  assert.equal(isOccurrenceOverdue(null, 'pending', '2026-08-03T06:00:00.000Z'), false)
})

// ─── Permissions (§3) ───────────────────────────────────────────────────────

const admin = { permissions: null, brandAccess: null }
const employee = { permissions: {}, brandAccess: {} }
const manager = { permissions: { duties: 'edit' as const }, brandAccess: { duties: [BRAND_GLITZ] } }
const reviewer = { permissions: { duties_review: 'view' as const }, brandAccess: {} }

test('an ordinary employee may view and complete their own duties only', () => {
  assert.equal(dutyCan(employee, 'view_own'), true)
  assert.equal(dutyCan(employee, 'complete_own'), true)
  assert.equal(dutyCan(employee, 'create'), false)
  assert.equal(dutyCan(employee, 'assign'), false)
  assert.equal(dutyCan(employee, 'edit'), false)
  assert.equal(dutyCan(employee, 'pause'), false)
  assert.equal(dutyCan(employee, 'end'), false)
})

test('the founding admin holds every capability', () => {
  for (const c of ['create', 'assign', 'edit', 'pause', 'end', 'view_all', 'review'] as const) {
    assert.equal(dutyCan(admin, c), true, c)
  }
})

test('a brand-scoped manager may assign inside their brand only', () => {
  assert.equal(canAssignDutyInBrand(manager, BRAND_GLITZ), true)
  assert.equal(canAssignDutyInBrand(manager, BRAND_NPT), false)
})

test('a brand-scoped manager cannot create a group-wide duty', () => {
  assert.equal(canAssignDutyInBrand(manager, null), false)
})

test('an unscoped admin can create a group-wide duty', () => {
  assert.equal(canAssignDutyInBrand(admin, null), true)
})

test('an employee cannot assign in any brand', () => {
  assert.equal(canAssignDutyInBrand(employee, BRAND_GLITZ), false)
})

test('view_all requires an unscoped grant; a scoped manager gets brand scope', () => {
  assert.equal(dutyCan(manager, 'view_all'), false)
  assert.deepEqual(dutyScope(manager), { kind: 'brands', brandIds: [BRAND_GLITZ] })
  assert.deepEqual(dutyScope(employee), { kind: 'own' })
  assert.deepEqual(dutyScope(admin), { kind: 'all' })
})

test('a reviewer can review without being able to edit duty definitions', () => {
  assert.equal(dutyCan(reviewer, 'review'), true)
  assert.equal(dutyCan(reviewer, 'edit'), false)
})

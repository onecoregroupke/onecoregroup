import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateWeights, scoreTaskDuty, scoreAttendance, scoreRoleOutput, scoreQuality,
  computePerformance, DEFAULT_WEIGHTS, MAX_ATTENDANCE_WEIGHT,
} from './performanceModel'

// §37 "Performance" testing requirements.

// ─── Weight configuration ───────────────────────────────────────────────────

test('the default weights are valid and total 100', () => {
  assert.deepEqual(validateWeights(DEFAULT_WEIGHTS), [])
})

test('weights that do not total 100 are rejected', () => {
  const p = validateWeights({ task_duty: 50, role_output: 30, quality: 20, attendance: 10 })
  assert.match(p[0], /must total 100/)
})

test('attendance cannot be configured to dominate the score', () => {
  // §11: "Weight attendance moderately rather than letting it dominate."
  const p = validateWeights({ task_duty: 20, role_output: 20, quality: 10, attendance: 50 })
  assert.ok(p.some((x) => x.includes('must not dominate')))
  assert.equal(MAX_ATTENDANCE_WEIGHT, 25)
})

test('a negative weight is rejected', () => {
  const p = validateWeights({ task_duty: 110, role_output: 0, quality: 0, attendance: -10 })
  assert.ok(p.some((x) => /cannot be negative/.test(x)))
})

// ─── Component A: task and duty reliability ─────────────────────────────────

test('perfect completion and punctuality scores 100', () => {
  const c = scoreTaskDuty({
    tasksAssigned: 10, tasksCompleted: 10, tasksOnTime: 10, tasksReopened: 0,
    dutiesDue: 5, dutiesCompleted: 5, dutiesOnTime: 5,
  })
  assert.equal(c.score, 100)
})

test('an employee assigned nothing gets NO score, not 0%', () => {
  // Scoring "no work given" as zero is indistinguishable from failure.
  const c = scoreTaskDuty({
    tasksAssigned: 0, tasksCompleted: 0, tasksOnTime: 0, tasksReopened: 0,
    dutiesDue: 0, dutiesCompleted: 0, dutiesOnTime: 0,
  })
  assert.equal(c.score, null)
  assert.equal(c.insufficientData, true)
})

test('the score always carries a breakdown explaining it', () => {
  // §11: "Do not create a single mysterious percentage."
  const c = scoreTaskDuty({
    tasksAssigned: 10, tasksCompleted: 8, tasksOnTime: 6, tasksReopened: 1,
    dutiesDue: 0, dutiesCompleted: 0, dutiesOnTime: 0,
  })
  assert.ok(c.breakdown.length >= 3)
  assert.equal(c.breakdown[0].label, 'Completed')
  assert.equal(c.breakdown[0].value, 8)
  assert.equal(c.breakdown[0].of, 10)
})

test('the reopen penalty is capped so one bad week cannot zero the component', () => {
  const many = scoreTaskDuty({
    tasksAssigned: 20, tasksCompleted: 20, tasksOnTime: 20, tasksReopened: 20,
    dutiesDue: 0, dutiesCompleted: 0, dutiesOnTime: 0,
  })
  assert.equal(many.score, 80)   // 100 - capped 20, not 100 - 100
})

test('a score never leaves the 0..100 range', () => {
  const c = scoreTaskDuty({
    tasksAssigned: 1, tasksCompleted: 0, tasksOnTime: 0, tasksReopened: 50,
    dutiesDue: 0, dutiesCompleted: 0, dutiesOnTime: 0,
  })
  assert.ok(c.score !== null && c.score >= 0 && c.score <= 100)
})

// ─── Component B: attendance ────────────────────────────────────────────────

test('approved leave does not reduce the attendance score', () => {
  // daysScheduled already excludes leave (see attendanceModel.summariseAttendance).
  const withLeave = scoreAttendance({
    daysScheduled: 4, daysPresent: 4, daysLateBeyondGrace: 0, daysAbsent: 0, daysOnLeave: 1,
  })
  const withoutLeave = scoreAttendance({
    daysScheduled: 4, daysPresent: 4, daysLateBeyondGrace: 0, daysAbsent: 0, daysOnLeave: 0,
  })
  assert.equal(withLeave.score, 100)
  assert.equal(withLeave.score, withoutLeave.score)
})

test('a period made entirely of approved leave is not a 0% record', () => {
  const c = scoreAttendance({
    daysScheduled: 0, daysPresent: 0, daysLateBeyondGrace: 0, daysAbsent: 0, daysOnLeave: 5,
  })
  assert.equal(c.score, null)
  assert.equal(c.insufficientData, true)
})

test('lateness inside the grace period does not reduce the score', () => {
  // The caller passes the grace-adjusted count, so zero here means "late but
  // within grace" — and the score is unaffected.
  const c = scoreAttendance({
    daysScheduled: 5, daysPresent: 5, daysLateBeyondGrace: 0, daysAbsent: 0, daysOnLeave: 0,
  })
  assert.equal(c.score, 100)
})

test('lateness beyond grace reduces punctuality but not presence', () => {
  const c = scoreAttendance({
    daysScheduled: 5, daysPresent: 5, daysLateBeyondGrace: 2, daysAbsent: 0, daysOnLeave: 0,
  })
  assert.ok(c.score !== null && c.score < 100)
  assert.equal(c.breakdown[0].percent, 100)   // presence untouched
})

test('absence reduces the attendance score', () => {
  const c = scoreAttendance({
    daysScheduled: 5, daysPresent: 3, daysLateBeyondGrace: 0, daysAbsent: 2, daysOnLeave: 0,
  })
  assert.ok(c.score !== null && c.score < 100)
})

// ─── Component C: role-specific output ──────────────────────────────────────

test('an unconfigured role produces no output score rather than a misleading one', () => {
  assert.equal(scoreRoleOutput([]).score, null)
  assert.equal(scoreRoleOutput([
    { metric_key: 'units', label: 'Units sold', value: 100, target: null, higher_is_better: true, weight: 1 },
  ]).insufficientData, true)
})

test('each role metric is scored against its own target', () => {
  const c = scoreRoleOutput([
    { metric_key: 'units', label: 'Units sold', value: 900, target: 1000, higher_is_better: true, weight: 1 },
  ])
  assert.equal(c.score, 90)
})

test('a lower-is-better metric inverts correctly', () => {
  const c = scoreRoleOutput([
    { metric_key: 'turnaround', label: 'Repair turnaround (days)', value: 4, target: 5, higher_is_better: false, weight: 1 },
  ])
  assert.equal(c.score, 100)   // beat the target, capped at 100
})

test('metrics are combined by their configured weights', () => {
  const c = scoreRoleOutput([
    { metric_key: 'a', label: 'A', value: 100, target: 100, higher_is_better: true, weight: 3 },
    { metric_key: 'b', label: 'B', value: 0, target: 100, higher_is_better: true, weight: 1 },
  ])
  assert.equal(c.score, 75)
})

test('a salesperson and a storekeeper are never compared on raw numbers', () => {
  // Each is scored against its OWN target, so 900/1000 units and 45/50 issues
  // both read as 90% — the comparison is attainment, not output volume.
  const sales = scoreRoleOutput([{ metric_key: 'units', label: 'Units', value: 900, target: 1000, higher_is_better: true, weight: 1 }])
  const store = scoreRoleOutput([{ metric_key: 'issues', label: 'Issues', value: 45, target: 50, higher_is_better: true, weight: 1 }])
  assert.equal(sales.score, store.score)
})

// ─── Component D: quality ───────────────────────────────────────────────────

test('quality with no signal at all yields no score', () => {
  const c = scoreQuality({
    tasksReopened: 0, tasksCompleted: 0, evidenceProvided: 0, evidenceRequired: 0,
    managerRatings: [], complianceIssues: 0,
  })
  assert.equal(c.score, null)
})

test('reopened work reduces the first-pass rate', () => {
  const clean = scoreQuality({ tasksReopened: 0, tasksCompleted: 10, evidenceProvided: 0, evidenceRequired: 0, managerRatings: [], complianceIssues: 0 })
  const messy = scoreQuality({ tasksReopened: 5, tasksCompleted: 10, evidenceProvided: 0, evidenceRequired: 0, managerRatings: [], complianceIssues: 0 })
  assert.ok((messy.score ?? 0) < (clean.score ?? 0))
})

test('manager ratings map 1..5 onto the score', () => {
  const top = scoreQuality({ tasksReopened: 0, tasksCompleted: 0, evidenceProvided: 0, evidenceRequired: 0, managerRatings: [5], complianceIssues: 0 })
  const low = scoreQuality({ tasksReopened: 0, tasksCompleted: 0, evidenceProvided: 0, evidenceRequired: 0, managerRatings: [1], complianceIssues: 0 })
  assert.ok((top.score ?? 0) > (low.score ?? 0))
})

// ─── Overall combination ────────────────────────────────────────────────────

const full = {
  taskDuty: { score: 80, breakdown: [], insufficientData: false },
  roleOutput: { score: 90, breakdown: [], insufficientData: false },
  quality: { score: 70, breakdown: [], insufficientData: false },
  attendance: { score: 100, breakdown: [], insufficientData: false },
}

test('the overall score applies the configured weights', () => {
  const r = computePerformance(full)
  // 80*.4 + 90*.3 + 70*.2 + 100*.1 = 32 + 27 + 14 + 10 = 83
  assert.equal(r.overall, 83)
})

test('a complete period is not provisional', () => {
  assert.equal(computePerformance(full).isProvisional, false)
  assert.deepEqual(computePerformance(full).missingComponents, [])
})

test('a component with NO data is excluded, not scored as zero', () => {
  // Treating "no data" as "failed" is the commonest way a rating becomes unfair.
  const r = computePerformance({
    ...full, roleOutput: { score: null, breakdown: [], insufficientData: true },
  })
  // Remaining weights 40/20/10 = 70, renormalised.
  const expected = Math.round(((80 * 40 + 70 * 20 + 100 * 10) / 70) * 10) / 10
  assert.equal(r.overall, expected)
  assert.ok(r.overall! > 0)
})

test('a period missing any component is flagged provisional', () => {
  const r = computePerformance({
    ...full, roleOutput: { score: null, breakdown: [], insufficientData: true },
  })
  assert.equal(r.isProvisional, true)
  assert.deepEqual(r.missingComponents, ['Role-specific output'])
})

test('excluding a component redistributes its weight rather than discarding it', () => {
  const r = computePerformance({
    ...full, roleOutput: { score: null, breakdown: [], insufficientData: true },
  })
  const total = r.effectiveWeights.task_duty + r.effectiveWeights.quality + r.effectiveWeights.attendance
  assert.ok(Math.abs(total - 100) < 0.5)
  assert.equal(r.effectiveWeights.role_output, 0)
})

test('a period with no scorable component at all yields no overall score', () => {
  const none = { score: null, breakdown: [], insufficientData: true }
  const r = computePerformance({ taskDuty: none, roleOutput: none, quality: none, attendance: none })
  assert.equal(r.overall, null)
  assert.equal(r.isProvisional, true)
})

test('attendance alone cannot swing the overall score far', () => {
  // §11: attendance is weighted moderately. Dropping it from 100 to 0 must move
  // the overall by no more than its 10% weight.
  const good = computePerformance(full).overall!
  const bad = computePerformance({ ...full, attendance: { score: 0, breakdown: [], insufficientData: false } }).overall!
  assert.ok(good - bad <= 10.01, `attendance moved the score by ${good - bad}`)
})

test('the result always reports the weights it used', () => {
  const r = computePerformance(full)
  assert.deepEqual(r.weightsUsed, DEFAULT_WEIGHTS)
})

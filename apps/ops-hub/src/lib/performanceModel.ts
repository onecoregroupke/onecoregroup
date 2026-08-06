// Transparent performance scoring (§11). Pure — unit-tested.
//
// §11 says what NOT to build as clearly as what to build:
//   "Do not create a single mysterious percentage without showing how it was
//    calculated."
//   "Approved leave must not reduce the rating."
//   "A minor late arrival within a configured grace period should not reduce
//    the score."
//   "Weight attendance moderately rather than letting it dominate."
//
// Every function here therefore returns its INPUTS alongside its output, and no
// score is ever produced without the component breakdown that explains it.

export interface Weights {
  task_duty: number
  role_output: number
  quality: number
  attendance: number
}

export const DEFAULT_WEIGHTS: Weights = {
  task_duty: 40, role_output: 30, quality: 20, attendance: 10,
}

/** §11: attendance must not dominate. Mirrors the DB CHECK constraint. */
export const MAX_ATTENDANCE_WEIGHT = 25

export function validateWeights(w: Weights): string[] {
  const problems: string[] = []
  const total = w.task_duty + w.role_output + w.quality + w.attendance
  if (Math.abs(total - 100) > 0.005) problems.push(`Weights must total 100 (got ${total}).`)
  for (const [k, v] of Object.entries(w)) {
    if (v < 0) problems.push(`Weight ${k} cannot be negative.`)
  }
  if (w.attendance > MAX_ATTENDANCE_WEIGHT) {
    problems.push(`Attendance weight cannot exceed ${MAX_ATTENDANCE_WEIGHT} — it must not dominate the score.`)
  }
  return problems
}

// ─── Component A: task and duty reliability (§11A) ──────────────────────────

export interface TaskDutyInputs {
  tasksAssigned: number
  tasksCompleted: number
  tasksOnTime: number
  tasksReopened: number
  dutiesDue: number
  dutiesCompleted: number
  dutiesOnTime: number
}

export interface ComponentScore {
  score: number | null
  /** Why the score is what it is — never a bare number. */
  breakdown: Array<{ label: string; value: number; of: number; percent: number }>
  /** Set when there is not enough data to score honestly. */
  insufficientData: boolean
}

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : 0
}

/**
 * Completion and punctuality across tasks and duties.
 * With nothing assigned there is no score — an employee who was given no work
 * must not be recorded as 0%, which would be indistinguishable from failure.
 */
export function scoreTaskDuty(i: TaskDutyInputs): ComponentScore {
  const totalDue = i.tasksAssigned + i.dutiesDue
  if (totalDue === 0) {
    return { score: null, breakdown: [], insufficientData: true }
  }

  const completed = i.tasksCompleted + i.dutiesCompleted
  const onTime = i.tasksOnTime + i.dutiesOnTime

  const completionRate = pct(completed, totalDue)
  const punctualityRate = pct(onTime, Math.max(1, completed))
  // Reopened work is a real signal but capped, so one bad week cannot zero the
  // component on its own.
  const reopenPenalty = Math.min(20, i.tasksReopened * 5)

  const score = Math.max(0, Math.min(100,
    Math.round((completionRate * 0.6 + punctualityRate * 0.4 - reopenPenalty) * 10) / 10,
  ))

  return {
    score,
    breakdown: [
      { label: 'Completed', value: completed, of: totalDue, percent: completionRate },
      { label: 'On time', value: onTime, of: completed, percent: punctualityRate },
      { label: 'Reopened (penalty)', value: i.tasksReopened, of: totalDue, percent: -reopenPenalty },
    ],
    insufficientData: false,
  }
}

// ─── Component B: attendance reliability (§11B) ─────────────────────────────

export interface AttendanceInputs {
  daysScheduled: number     // ALREADY excludes approved leave, holidays, rest days
  daysPresent: number
  daysLateBeyondGrace: number
  daysAbsent: number
  daysOnLeave: number
}

/**
 * §11B, with two explicit protections:
 *   - Approved leave is not in `daysScheduled` at all, so it cannot reduce the
 *     score (attendanceModel.summariseAttendance already removes it).
 *   - Only lateness BEYOND the grace period counts; `daysLateBeyondGrace` is
 *     the caller's grace-adjusted figure.
 */
export function scoreAttendance(i: AttendanceInputs): ComponentScore {
  if (i.daysScheduled === 0) {
    // A period made entirely of approved leave is not a 0% attendance record.
    return { score: null, breakdown: [], insufficientData: true }
  }
  const presenceRate = pct(i.daysPresent, i.daysScheduled)
  const punctualityRate = pct(Math.max(0, i.daysPresent - i.daysLateBeyondGrace), Math.max(1, i.daysPresent))
  const score = Math.round((presenceRate * 0.7 + punctualityRate * 0.3) * 10) / 10

  return {
    score: Math.max(0, Math.min(100, score)),
    breakdown: [
      { label: 'Days present', value: i.daysPresent, of: i.daysScheduled, percent: presenceRate },
      { label: 'On-time arrivals', value: i.daysPresent - i.daysLateBeyondGrace, of: i.daysPresent, percent: punctualityRate },
      { label: 'Approved leave (excluded)', value: i.daysOnLeave, of: i.daysOnLeave, percent: 0 },
    ],
    insufficientData: false,
  }
}

// ─── Component C: role-specific output (§11C) ───────────────────────────────

export interface RoleMetricValue {
  metric_key: string
  label: string
  value: number
  target: number | null
  higher_is_better: boolean
  weight: number
}

/**
 * §11C: role output differs by role, so this scores each configured metric
 * against ITS OWN target and weights them. An unconfigured role produces no
 * score rather than a misleading one — "do not compare employees performing
 * fundamentally different roles using raw output numbers".
 */
export function scoreRoleOutput(metrics: RoleMetricValue[]): ComponentScore {
  const scorable = metrics.filter((m) => m.target != null && m.target !== 0)
  if (scorable.length === 0) return { score: null, breakdown: [], insufficientData: true }

  const totalWeight = scorable.reduce((s, m) => s + (m.weight || 1), 0)
  let weighted = 0
  const breakdown: ComponentScore['breakdown'] = []

  for (const m of scorable) {
    const target = m.target as number
    const raw = m.higher_is_better ? (m.value / target) : (target / Math.max(m.value, 0.0001))
    const attainment = Math.max(0, Math.min(150, raw * 100))   // over-attainment credited, capped
    weighted += attainment * ((m.weight || 1) / totalWeight)
    breakdown.push({
      label: m.label, value: m.value, of: target,
      percent: Math.round(attainment * 10) / 10,
    })
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(weighted * 10) / 10)),
    breakdown,
    insufficientData: false,
  }
}

// ─── Component D: quality and compliance (§11D) ─────────────────────────────

export interface QualityInputs {
  tasksReopened: number
  tasksCompleted: number
  evidenceProvided: number
  evidenceRequired: number
  managerRatings: number[]      // 1..5
  complianceIssues: number
}

export function scoreQuality(i: QualityInputs): ComponentScore {
  const hasSignal = i.tasksCompleted > 0 || i.evidenceRequired > 0 || i.managerRatings.length > 0
  if (!hasSignal) return { score: null, breakdown: [], insufficientData: true }

  const firstPassRate = i.tasksCompleted > 0
    ? pct(Math.max(0, i.tasksCompleted - i.tasksReopened), i.tasksCompleted)
    : 100
  const documentationRate = i.evidenceRequired > 0 ? pct(i.evidenceProvided, i.evidenceRequired) : 100
  const ratingScore = i.managerRatings.length > 0
    ? (i.managerRatings.reduce((s, r) => s + r, 0) / i.managerRatings.length) * 20
    : 100
  const compliancePenalty = Math.min(25, i.complianceIssues * 5)

  const score = Math.max(0, Math.min(100, Math.round(
    (firstPassRate * 0.4 + documentationRate * 0.3 + ratingScore * 0.3 - compliancePenalty) * 10,
  ) / 10))

  return {
    score,
    breakdown: [
      { label: 'Completed first time', value: i.tasksCompleted - i.tasksReopened, of: i.tasksCompleted, percent: firstPassRate },
      { label: 'Documentation provided', value: i.evidenceProvided, of: i.evidenceRequired, percent: documentationRate },
      { label: 'Manager quality rating', value: i.managerRatings.length, of: 5, percent: Math.round(ratingScore * 10) / 10 },
      { label: 'Compliance issues (penalty)', value: i.complianceIssues, of: 0, percent: -compliancePenalty },
    ],
    insufficientData: false,
  }
}

// ─── Overall (§11 "Show component scores") ──────────────────────────────────

export interface PerformanceResult {
  overall: number | null
  components: {
    taskDuty: ComponentScore
    roleOutput: ComponentScore
    quality: ComponentScore
    attendance: ComponentScore
  }
  weightsUsed: Weights
  /** Weights actually applied after dropping unscorable components. */
  effectiveWeights: Weights
  isProvisional: boolean
  missingComponents: string[]
}

/**
 * Combine components into an overall figure.
 *
 * A component with no data is EXCLUDED and its weight redistributed, rather
 * than being scored as zero — treating "no data" as "failed" is the single
 * most common way a rating like this becomes unfair.
 *
 * `isProvisional` defaults true and only clears when every component has data,
 * per §11's "do not activate consequential scoring until the data inputs have
 * been validated".
 */
export function computePerformance(
  components: PerformanceResult['components'],
  weights: Weights = DEFAULT_WEIGHTS,
): PerformanceResult {
  const entries: Array<[keyof Weights, ComponentScore, string]> = [
    ['task_duty', components.taskDuty, 'Task and duty reliability'],
    ['role_output', components.roleOutput, 'Role-specific output'],
    ['quality', components.quality, 'Quality and compliance'],
    ['attendance', components.attendance, 'Attendance reliability'],
  ]

  const scorable = entries.filter(([, c]) => c.score != null && !c.insufficientData)
  const missingComponents = entries.filter(([, c]) => c.score == null || c.insufficientData).map(([, , label]) => label)

  const effectiveWeights: Weights = { task_duty: 0, role_output: 0, quality: 0, attendance: 0 }
  if (scorable.length === 0) {
    return {
      overall: null, components, weightsUsed: weights, effectiveWeights,
      isProvisional: true, missingComponents,
    }
  }

  const totalWeight = scorable.reduce((s, [k]) => s + weights[k], 0)
  let overall = 0
  for (const [k, c] of scorable) {
    const share = totalWeight > 0 ? weights[k] / totalWeight : 0
    effectiveWeights[k] = Math.round(share * 1000) / 10
    overall += (c.score as number) * share
  }

  return {
    overall: Math.round(overall * 10) / 10,
    components,
    weightsUsed: weights,
    effectiveWeights,
    isProvisional: missingComponents.length > 0,
    missingComponents,
  }
}

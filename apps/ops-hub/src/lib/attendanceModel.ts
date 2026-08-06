// Attendance calculation (§§9–10). Pure — unit-tested in attendanceModel.test.ts.
//
// Everything here judges a day against the schedule that was in force ON THAT
// DAY (§10), not the employee's current schedule. Getting that wrong would
// silently rewrite history every time someone's hours change.

export interface WorkSchedule {
  id?: string
  workdays: number[]          // 0=Sun … 6=Sat
  start_time: string          // 'HH:MM' wall clock
  end_time: string
  break_minutes: number
  expected_hours: number
  grace_minutes: number
  timezone?: string
  effective_from?: string | null
  effective_to?: string | null
  active?: boolean
}

export interface ScheduleOverride {
  start_date: string
  end_date: string
  start_time?: string | null
  end_time?: string | null
  break_minutes?: number | null
  expected_hours?: number | null
  workdays?: number[] | null
}

export const ATTENDANCE_STATUSES = [
  'present', 'late', 'absent', 'half_day', 'on_leave', 'holiday', 'rest_day', 'incomplete',
] as const
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]

const EAT_OFFSET = '+03:00'   // Africa/Nairobi, no DST

function atLocal(dateISO: string, hhmm: string, timezone = 'Africa/Nairobi'): string | null {
  if (!/^\d{2}:\d{2}$/.test(hhmm ?? '')) return null
  const offset = timezone === 'Africa/Nairobi' ? EAT_OFFSET : 'Z'
  return new Date(`${dateISO}T${hhmm}:00${offset}`).toISOString()
}

function dow(dateISO: string): number {
  return new Date(`${dateISO}T00:00:00Z`).getUTCDay()
}

function minutesBetween(aIso: string, bIso: string): number {
  return Math.round((Date.parse(bIso) - Date.parse(aIso)) / 60_000)
}

/**
 * The schedule in force for an employee on a date (§10).
 * Picks the most recent schedule whose effective window contains the date, then
 * layers any override on top. Returns null when the employee has no schedule —
 * the caller must NOT fall back to a company default, because §10 forbids
 * applying one universal arrival time to everybody.
 */
export function effectiveSchedule(
  schedules: WorkSchedule[],
  overrides: ScheduleOverride[],
  dateISO: string,
): WorkSchedule | null {
  const candidates = schedules
    .filter((s) => s.active !== false)
    .filter((s) => !s.effective_from || s.effective_from <= dateISO)
    .filter((s) => !s.effective_to || s.effective_to >= dateISO)
    .sort((a, b) => (b.effective_from ?? '').localeCompare(a.effective_from ?? ''))

  const base = candidates[0]
  if (!base) return null

  const ov = overrides.find((o) => o.start_date <= dateISO && o.end_date >= dateISO)
  if (!ov) return base

  return {
    ...base,
    start_time: ov.start_time || base.start_time,
    end_time: ov.end_time || base.end_time,
    break_minutes: ov.break_minutes ?? base.break_minutes,
    expected_hours: ov.expected_hours ?? base.expected_hours,
    workdays: ov.workdays ?? base.workdays,
  }
}

export function isWorkday(schedule: WorkSchedule | null, dateISO: string): boolean {
  if (!schedule) return false
  return schedule.workdays.includes(dow(dateISO))
}

// ─── Punch handling (§9) ────────────────────────────────────────────────────

export interface Punch { at: string; kind?: string }

/**
 * Collapse a day's raw punches into a first-in / last-out pair (§9 "Detect
 * duplicate punches").
 *
 * Duplicates are collapsed, not discarded: every punch is preserved by the
 * caller in all_punches so the reduction stays auditable. Punches within
 * `dedupeWindowMinutes` of each other are treated as one event — that is the
 * classic double-tap on a fingerprint reader.
 */
export function collapsePunches(
  punches: Punch[],
  dedupeWindowMinutes = 5,
): { checkIn: string | null; checkOut: string | null; punchCount: number; duplicates: number } {
  const sorted = [...punches]
    .map((p) => p.at)
    .filter((at) => Number.isFinite(Date.parse(at)))
    .sort()

  if (sorted.length === 0) return { checkIn: null, checkOut: null, punchCount: 0, duplicates: 0 }

  const distinct: string[] = [sorted[0]]
  let duplicates = 0
  for (const at of sorted.slice(1)) {
    if (minutesBetween(distinct[distinct.length - 1], at) <= dedupeWindowMinutes) duplicates++
    else distinct.push(at)
  }

  return {
    checkIn: distinct[0],
    // A single punch is a check-in with a MISSING check-out, never a zero-length
    // day — that distinction is what §9's "missing clock-out" report is built on.
    checkOut: distinct.length > 1 ? distinct[distinct.length - 1] : null,
    punchCount: sorted.length,
    duplicates,
  }
}

// ─── Daily calculation ──────────────────────────────────────────────────────

export interface AttendanceInput {
  dateISO: string
  schedule: WorkSchedule | null
  checkIn: string | null
  checkOut: string | null
  onApprovedLeave?: boolean
  isHoliday?: boolean
}

export interface AttendanceCalc {
  status: AttendanceStatus
  scheduledStartAt: string | null
  scheduledEndAt: string | null
  expectedMinutes: number
  actualMinutes: number
  lateMinutes: number
  earlyDepartureMinutes: number
  overtimeMinutes: number
  breakMinutes: number
}

/**
 * Derive a day's attendance figures.
 *
 * Precedence matters and is asserted by tests: approved leave outranks a missing
 * punch, so a person on approved leave is never marked absent (§11 "Approved
 * leave must not reduce the rating"). A non-workday is a rest day, not an
 * absence. Lateness inside the grace period is not lateness at all.
 */
export function calculateAttendance(input: AttendanceInput): AttendanceCalc {
  const { dateISO, schedule, checkIn, checkOut } = input
  const tz = schedule?.timezone ?? 'Africa/Nairobi'
  const scheduledStartAt = schedule ? atLocal(dateISO, schedule.start_time, tz) : null
  const scheduledEndAt = schedule ? atLocal(dateISO, schedule.end_time, tz) : null
  const breakMinutes = schedule?.break_minutes ?? 0
  const expectedMinutes = schedule ? Math.round(schedule.expected_hours * 60) : 0

  const base: AttendanceCalc = {
    status: 'present',
    scheduledStartAt, scheduledEndAt,
    expectedMinutes, actualMinutes: 0,
    lateMinutes: 0, earlyDepartureMinutes: 0, overtimeMinutes: 0,
    breakMinutes,
  }

  // Approved leave wins over everything, including a missing punch.
  if (input.onApprovedLeave) return { ...base, status: 'on_leave', expectedMinutes: 0 }
  if (input.isHoliday) return { ...base, status: 'holiday', expectedMinutes: 0 }
  if (!isWorkday(schedule, dateISO)) return { ...base, status: 'rest_day', expectedMinutes: 0 }

  if (!checkIn && !checkOut) return { ...base, status: 'absent' }
  // One punch only: hours are unknown, so claim nothing rather than guess.
  if (!checkIn || !checkOut) {
    return { ...base, status: 'incomplete', actualMinutes: 0 }
  }

  const worked = Math.max(0, minutesBetween(checkIn, checkOut) - breakMinutes)
  const grace = schedule?.grace_minutes ?? 0

  const rawLate = scheduledStartAt ? minutesBetween(scheduledStartAt, checkIn) : 0
  // Inside grace is not late. Arriving early is not negative lateness.
  const lateMinutes = rawLate > grace ? rawLate : 0

  const rawEarly = scheduledEndAt ? minutesBetween(checkOut, scheduledEndAt) : 0
  const earlyDepartureMinutes = Math.max(0, rawEarly)

  const overtimeMinutes = Math.max(0, worked - expectedMinutes)

  let status: AttendanceStatus = 'present'
  if (lateMinutes > 0) status = 'late'
  if (expectedMinutes > 0 && worked > 0 && worked <= expectedMinutes / 2) status = 'half_day'

  return {
    ...base,
    status,
    actualMinutes: worked,
    lateMinutes,
    earlyDepartureMinutes,
    overtimeMinutes,
  }
}

// ─── Exceptions (§9 step 10) ────────────────────────────────────────────────

export interface AttendanceRecordLike {
  employee_name: string
  attendance_date: string
  status: string
  late_minutes: number
  actual_minutes: number
  expected_minutes: number
  check_in_at: string | null
  check_out_at: string | null
}

export interface AttendanceException {
  date: string
  employee: string
  kind: 'absent' | 'incomplete' | 'late' | 'undertime'
  detail: string
}

/** The exception report a manager actually reads — not the full register. */
export function attendanceExceptions(
  records: AttendanceRecordLike[],
  opts: { lateThresholdMinutes?: number } = {},
): AttendanceException[] {
  const lateThreshold = opts.lateThresholdMinutes ?? 1
  const out: AttendanceException[] = []
  for (const r of records) {
    // on_leave, holiday and rest_day are never exceptions.
    if (r.status === 'absent') {
      out.push({ date: r.attendance_date, employee: r.employee_name, kind: 'absent', detail: 'No clock-in recorded' })
    } else if (r.status === 'incomplete') {
      out.push({
        date: r.attendance_date, employee: r.employee_name, kind: 'incomplete',
        detail: r.check_in_at ? 'Missing clock-out' : 'Missing clock-in',
      })
    } else {
      if (r.late_minutes >= lateThreshold) {
        out.push({ date: r.attendance_date, employee: r.employee_name, kind: 'late', detail: `${r.late_minutes} min late` })
      }
      if (r.expected_minutes > 0 && r.actual_minutes > 0 && r.actual_minutes < r.expected_minutes) {
        const short = r.expected_minutes - r.actual_minutes
        out.push({ date: r.attendance_date, employee: r.employee_name, kind: 'undertime', detail: `${short} min short of expected` })
      }
    }
  }
  return out
}

// ─── Period summary ─────────────────────────────────────────────────────────

export interface AttendanceSummary {
  daysScheduled: number
  daysPresent: number
  daysLate: number
  daysAbsent: number
  daysOnLeave: number
  daysIncomplete: number
  expectedMinutes: number
  actualMinutes: number
  lateMinutes: number
  overtimeMinutes: number
  /** Present ÷ scheduled, as a percentage. Leave is excluded from BOTH sides. */
  attendanceRate: number
  punctualityRate: number
}

/**
 * Roll a period up for one employee.
 *
 * Approved leave is removed from the denominator entirely rather than counted
 * as a present or absent day — §11 requires that approved leave does not reduce
 * a rating, and leaving it in the denominator would do exactly that.
 */
export function summariseAttendance(records: AttendanceRecordLike[]): AttendanceSummary {
  const s: AttendanceSummary = {
    daysScheduled: 0, daysPresent: 0, daysLate: 0, daysAbsent: 0,
    daysOnLeave: 0, daysIncomplete: 0,
    expectedMinutes: 0, actualMinutes: 0, lateMinutes: 0, overtimeMinutes: 0,
    attendanceRate: 0, punctualityRate: 0,
  }
  for (const r of records) {
    if (r.status === 'on_leave') { s.daysOnLeave++; continue }
    if (r.status === 'holiday' || r.status === 'rest_day') continue

    s.daysScheduled++
    s.expectedMinutes += r.expected_minutes
    s.actualMinutes += r.actual_minutes
    s.lateMinutes += r.late_minutes

    if (r.status === 'absent') s.daysAbsent++
    else if (r.status === 'incomplete') s.daysIncomplete++
    else {
      s.daysPresent++
      if (r.status === 'late' || r.late_minutes > 0) s.daysLate++
    }
  }
  s.attendanceRate = s.daysScheduled > 0 ? Math.round((s.daysPresent / s.daysScheduled) * 100) : 0
  s.punctualityRate = s.daysPresent > 0
    ? Math.round(((s.daysPresent - s.daysLate) / s.daysPresent) * 100)
    : 0
  return s
}

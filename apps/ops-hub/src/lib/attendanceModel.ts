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

export interface AttendanceEvidencePoint {
  id: string
  source: 'biometric' | 'employee_self' | 'reviewer_manual' | 'historical_import' | 'system_auto'
  direction: 'in' | 'out'
  occurred_at: string
}

/** Pivot independent evidence without mutating or choosing a "winning" source. */
export function reconcileAttendanceEvidence(points: readonly AttendanceEvidencePoint[], thresholdMinutes = 10) {
  const sources = new Map<AttendanceEvidencePoint['source'], { in: string | null; out: string | null; ids: string[] }>()
  for (const point of points) {
    const source = sources.get(point.source) ?? { in: null, out: null, ids: [] }
    source.ids.push(point.id)
    if (point.direction === 'in' && (!source.in || point.occurred_at < source.in)) source.in = point.occurred_at
    if (point.direction === 'out' && (!source.out || point.occurred_at > source.out)) source.out = point.occurred_at
    sources.set(point.source, source)
  }
  const spread = (direction: 'in' | 'out') => {
    const values = [...sources.values()].map((source) => source[direction]).filter((value): value is string => !!value).map(Date.parse)
    return values.length > 1 ? Math.max(...values) - Math.min(...values) : 0
  }
  return { sources, discrepancy: spread('in') > thresholdMinutes * 60_000 || spread('out') > thresholdMinutes * 60_000 }
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
  // An EMPTY workday list declares no rest days — it is not "never works". The
  // imported schedules carry start/end times and expected hours with workdays
  // left unset, and their history records Saturdays as worked. Reading [] as
  // "no workdays" would turn every re-derived day into a rest day with no hours.
  if (schedule.workdays.length === 0) return true
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
  const { distinct, total } = distinctPunches(punches.map((p) => p.at), dedupeWindowMinutes)
  if (distinct.length === 0) return { checkIn: null, checkOut: null, punchCount: 0, duplicates: 0 }

  return {
    checkIn: distinct[0],
    // A single punch is a check-in with a MISSING check-out, never a zero-length
    // day — that distinction is what §9's "missing clock-out" report is built on.
    // (The lone EVENING punch is the exception — see interpretDayEvidence.)
    checkOut: distinct.length > 1 ? distinct[distinct.length - 1] : null,
    punchCount: total,
    duplicates: total - distinct.length,
  }
}

/** Sorted, parseable instants with double-taps inside the window collapsed. */
function distinctPunches(times: string[], dedupeWindowMinutes: number): { distinct: string[]; total: number } {
  const sorted = times
    .filter((at) => Number.isFinite(Date.parse(at)))
    .sort((a, b) => Date.parse(a) - Date.parse(b))
  const distinct: string[] = []
  for (const at of sorted) {
    const last = distinct[distinct.length - 1]
    if (last && minutesBetween(last, at) <= dedupeWindowMinutes) continue
    distinct.push(at)
  }
  return { distinct, total: sorted.length }
}

// ─── The lone close-out punch ───────────────────────────────────────────────
//
// The Deli reader has no IN/OUT key. Every import so far has read a day's
// punches as "first punch IN, last punch OUT when there are two or more", so a
// person who forgot to punch on arrival and punched once on leaving was recorded
// as ARRIVING at 17:14 — and their hours were then computed from that.
//
// The rule: when the day's ONLY device punch falls at or after 17:00 Nairobi
// time, it is the close-out. The arrival is unknown, so no hours are calculated
// until someone records the arrival time as manual evidence.

/** From this Nairobi wall-clock time, a day's only device punch is a close-out. */
export const LONE_PUNCH_CLOSEOUT_FROM = '17:00'

export type AttendanceSource = AttendanceEvidencePoint['source']

/**
 * Sources whose direction is INFERRED from punch order rather than recorded by
 * the person. Self-clock, reviewer entries and the system closeout all carry a
 * deliberate direction and are never reinterpreted.
 */
export const DEVICE_SOURCES: readonly AttendanceSource[] = ['biometric', 'historical_import']

export function isDeviceSource(source: string | null | undefined): boolean {
  return (DEVICE_SOURCES as readonly string[]).includes(source ?? '')
}

/** 'HH:MM' on the Nairobi wall clock. EAT is UTC+3 with no DST. */
export function nairobiClock(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  return new Date(t + 3 * 60 * 60_000).toISOString().slice(11, 16)
}

/**
 * Is this lone device punch the day's close-out?
 *
 * An evening shift that STARTS at or after the cutoff arrives in the evening, so
 * its lone punch stays an arrival — the rule is about people who forgot to punch
 * in, not about when people work.
 */
export function isLoneCloseoutPunch(
  punchAt: string,
  opts: { scheduledStartAt?: string | null; closeoutFrom?: string } = {},
): boolean {
  const from = opts.closeoutFrom ?? LONE_PUNCH_CLOSEOUT_FROM
  const clock = nairobiClock(punchAt)
  if (!clock || clock < from) return false
  const shiftStart = opts.scheduledStartAt ? nairobiClock(opts.scheduledStartAt) : ''
  return !(shiftStart && shiftStart >= from)
}

export interface DayEvidence {
  occurred_at: string
  direction: 'in' | 'out'
  source: AttendanceSource
}

export interface DayPunchInterpretation {
  checkIn: string | null
  checkOut: string | null
  checkInSource: AttendanceSource | null
  checkOutSource: AttendanceSource | null
  /** The day's only device punch was read as the close-out. */
  lonePunchCloseout: boolean
  /** A close-out with no arrival: hours wait for a manual arrival time. */
  checkInMissing: boolean
  checkOutMissing: boolean
}

/**
 * One day's check-in and check-out from every piece of evidence.
 *
 * Device punches are read together as a sequence (first IN, last OUT, lone
 * evening punch = close-out). Evidence with a deliberate direction — self-clock,
 * reviewer entry, system closeout — is taken at its word. The earliest arrival
 * and the latest departure across both win, exactly as before.
 */
export function interpretDayEvidence(
  events: DayEvidence[],
  opts: { scheduledStartAt?: string | null; closeoutFrom?: string; dedupeWindowMinutes?: number } = {},
): DayPunchInterpretation {
  const valid = events.filter((e) => Number.isFinite(Date.parse(e.occurred_at)))
  const device = valid.filter((e) => isDeviceSource(e.source))
  const explicit = valid.filter((e) => !isDeviceSource(e.source))
  const explicitIns = explicit.filter((e) => e.direction === 'in')
  const explicitOuts = explicit.filter((e) => e.direction === 'out')

  const { distinct } = distinctPunches(device.map((e) => e.occurred_at), opts.dedupeWindowMinutes ?? 5)
  const sourceAt = (at: string) =>
    device.find((e) => Date.parse(e.occurred_at) === Date.parse(at))?.source ?? 'biometric'

  const ins: Array<{ at: string; source: AttendanceSource }> = explicitIns.map((e) => ({ at: e.occurred_at, source: e.source }))
  const outs: Array<{ at: string; source: AttendanceSource }> = explicitOuts.map((e) => ({ at: e.occurred_at, source: e.source }))

  let lonePunchCloseout = false
  if (distinct.length === 1) {
    const only = distinct[0]!
    // A deliberate arrival recorded at or after the lone punch means the punch
    // cannot have closed that day's work.
    const arrivalAfter = explicitIns.some((e) => Date.parse(e.occurred_at) >= Date.parse(only))
    lonePunchCloseout = !arrivalAfter && isLoneCloseoutPunch(only, opts)
    if (lonePunchCloseout) outs.push({ at: only, source: sourceAt(only) })
    else ins.push({ at: only, source: sourceAt(only) })
  } else if (distinct.length > 1) {
    ins.push({ at: distinct[0]!, source: sourceAt(distinct[0]!) })
    outs.push({ at: distinct[distinct.length - 1]!, source: sourceAt(distinct[distinct.length - 1]!) })
  }

  const earliest = [...ins].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0] ?? null
  const latest = [...outs].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] ?? null

  return {
    checkIn: earliest?.at ?? null,
    checkOut: latest?.at ?? null,
    checkInSource: earliest?.source ?? null,
    checkOutSource: latest?.source ?? null,
    lonePunchCloseout: lonePunchCloseout && !earliest,
    checkInMissing: !earliest && !!latest,
    checkOutMissing: !!earliest && !latest,
  }
}

export interface StoredAttendanceLike {
  check_in_at: string | null
  check_out_at: string | null
  punch_count?: number | null
  scheduled_start_at?: string | null
  all_punches?: unknown
  raw_payload?: Record<string, unknown> | null
}

/** The instant of a stored punch, whatever shape its writer used. */
export function storedPunchAt(punch: unknown): string | null {
  if (!punch || typeof punch !== 'object') return null
  const p = punch as Record<string, unknown>
  const at = typeof p['at'] === 'string' ? p['at'] : typeof p['occurred_at'] === 'string' ? p['occurred_at'] : ''
  return at && Number.isFinite(Date.parse(at)) ? at : null
}

/**
 * Read a STORED day record the way the lone close-out rule would.
 *
 * Historical rows were written under "first punch IN" and are deliberately never
 * rewritten. This only changes how they are read: a day whose sole device punch
 * came at or after 17:00 is presented as a close-out with the arrival missing.
 * Rows whose arrival was recorded deliberately (self-clock, reviewer) are left
 * exactly as stored.
 */
export function interpretStoredAttendance(row: StoredAttendanceLike): {
  checkIn: string | null
  checkOut: string | null
  lonePunchCloseout: boolean
} {
  const raw = row.raw_payload ?? {}
  const stored = { checkIn: row.check_in_at, checkOut: row.check_out_at, lonePunchCloseout: raw['lone_punch_closeout'] === true }
  if (!row.check_in_at || row.check_out_at) return stored

  const inSource = typeof raw['check_in_source'] === 'string' ? raw['check_in_source'] : null
  if (inSource && !isDeviceSource(inSource)) return stored

  const times = (Array.isArray(row.all_punches) ? row.all_punches : [])
    .map(storedPunchAt)
    .filter((at): at is string => !!at)
  const distinctCount = times.length > 0
    ? distinctPunches(times, 5).distinct.length
    : Number(row.punch_count ?? 1)
  if (distinctCount > 1) return stored

  return isLoneCloseoutPunch(row.check_in_at, { scheduledStartAt: row.scheduled_start_at })
    ? { checkIn: null, checkOut: row.check_in_at, lonePunchCloseout: true }
    : stored
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

export function verifiedOvertimeMinutes(
  overtimeMinutes: number,
  checkoutSource: AttendanceEvidencePoint['source'] | null,
): number {
  return checkoutSource === 'system_auto' ? 0 : overtimeMinutes
}

export function effectiveOpenCheckoutAt(input: {
  nowIso: string
  scheduledEndAt: string | null
}): string {
  if (!input.scheduledEndAt || Number.isNaN(Date.parse(input.scheduledEndAt))) return input.nowIso
  if (Number.isNaN(Date.parse(input.nowIso))) return input.scheduledEndAt
  return Date.parse(input.nowIso) < Date.parse(input.scheduledEndAt)
    ? input.nowIso
    : input.scheduledEndAt
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

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  effectiveSchedule, isWorkday, collapsePunches, calculateAttendance,
  attendanceExceptions, summariseAttendance,
  type WorkSchedule, type AttendanceRecordLike,
} from './attendanceModel'

const MON = '2026-08-03'   // Monday
const SAT = '2026-08-08'   // Saturday

const standard: WorkSchedule = {
  workdays: [1, 2, 3, 4, 5],
  start_time: '08:00', end_time: '17:00',
  break_minutes: 60, expected_hours: 8, grace_minutes: 10,
  effective_from: '2026-01-01',
}

// EAT is UTC+3: 08:00 local = 05:00Z.
const at = (hhmm: string, date = MON) => `${date}T${hhmm}:00.000Z`

// ─── Effective schedule (§10) ───────────────────────────────────────────────

test('no schedule returns null — never a company-wide default', () => {
  // §10 forbids applying one universal arrival time to everybody, so the
  // absence of a schedule must be visible rather than silently filled in.
  assert.equal(effectiveSchedule([], [], MON), null)
})

test('the schedule in force on the date is used, not the newest one', () => {
  const old: WorkSchedule = { ...standard, start_time: '07:00', effective_from: '2026-01-01', effective_to: '2026-06-30' }
  const current: WorkSchedule = { ...standard, start_time: '09:00', effective_from: '2026-07-01' }
  assert.equal(effectiveSchedule([old, current], [], '2026-03-01')?.start_time, '07:00')
  assert.equal(effectiveSchedule([old, current], [], MON)?.start_time, '09:00')
})

test('an inactive schedule is ignored', () => {
  assert.equal(effectiveSchedule([{ ...standard, active: false }], [], MON), null)
})

test('an override layers on top of the standing schedule for its window only', () => {
  const ov = { start_date: MON, end_date: MON, start_time: '06:00', expected_hours: 6 }
  const applied = effectiveSchedule([standard], [ov], MON)
  assert.equal(applied?.start_time, '06:00')
  assert.equal(applied?.expected_hours, 6)
  assert.equal(applied?.end_time, '17:00')   // untouched fields survive
  assert.equal(effectiveSchedule([standard], [ov], '2026-08-04')?.start_time, '08:00')
})

test('workdays come from the effective schedule', () => {
  assert.equal(isWorkday(standard, MON), true)
  assert.equal(isWorkday(standard, SAT), false)
  assert.equal(isWorkday(null, MON), false)
})

// ─── Punch collapsing (§9) ──────────────────────────────────────────────────

test('a double-tap within the dedupe window collapses to one event', () => {
  const r = collapsePunches([
    { at: at('05:00') }, { at: at('05:02') },   // double tap
    { at: at('14:00') },
  ])
  assert.equal(r.checkIn, at('05:00'))
  assert.equal(r.checkOut, at('14:00'))
  assert.equal(r.punchCount, 3)
  assert.equal(r.duplicates, 1)
})

test('a single punch is a missing clock-out, not a zero-length day', () => {
  const r = collapsePunches([{ at: at('05:00') }])
  assert.equal(r.checkIn, at('05:00'))
  assert.equal(r.checkOut, null)
})

test('punches out of order are sorted before collapsing', () => {
  const r = collapsePunches([{ at: at('14:00') }, { at: at('05:00') }])
  assert.equal(r.checkIn, at('05:00'))
  assert.equal(r.checkOut, at('14:00'))
})

test('no punches yields nothing rather than a fabricated day', () => {
  const r = collapsePunches([])
  assert.deepEqual(r, { checkIn: null, checkOut: null, punchCount: 0, duplicates: 0 })
})

test('unparseable punches are dropped, not treated as epoch zero', () => {
  const r = collapsePunches([{ at: 'not-a-date' }, { at: at('05:00') }])
  assert.equal(r.checkIn, at('05:00'))
})

// ─── Daily calculation ──────────────────────────────────────────────────────

test('a normal day: on time, full hours', () => {
  const c = calculateAttendance({ dateISO: MON, schedule: standard, checkIn: at('05:00'), checkOut: at('14:00') })
  assert.equal(c.status, 'present')
  assert.equal(c.actualMinutes, 480)     // 9h minus 1h break
  assert.equal(c.lateMinutes, 0)
  assert.equal(c.overtimeMinutes, 0)
})

test('arriving inside the grace period is not late', () => {
  const c = calculateAttendance({ dateISO: MON, schedule: standard, checkIn: at('05:08'), checkOut: at('14:00') })
  assert.equal(c.status, 'present')
  assert.equal(c.lateMinutes, 0)
})

test('arriving past grace is late by the full amount', () => {
  const c = calculateAttendance({ dateISO: MON, schedule: standard, checkIn: at('05:30'), checkOut: at('14:00') })
  assert.equal(c.status, 'late')
  assert.equal(c.lateMinutes, 30)
})

test('arriving early is never negative lateness', () => {
  const c = calculateAttendance({ dateISO: MON, schedule: standard, checkIn: at('04:30'), checkOut: at('14:00') })
  assert.equal(c.lateMinutes, 0)
  assert.equal(c.status, 'present')
})

test('leaving early is measured; leaving late is overtime not negative', () => {
  const early = calculateAttendance({ dateISO: MON, schedule: standard, checkIn: at('05:00'), checkOut: at('12:00') })
  assert.equal(early.earlyDepartureMinutes, 120)
  const late = calculateAttendance({ dateISO: MON, schedule: standard, checkIn: at('05:00'), checkOut: at('16:00') })
  assert.equal(late.earlyDepartureMinutes, 0)
  assert.equal(late.overtimeMinutes, 120)   // 11h - 1h break - 8h expected
})

test('approved leave outranks a missing punch and expects no hours', () => {
  // §11: approved leave must not reduce a rating.
  const c = calculateAttendance({
    dateISO: MON, schedule: standard, checkIn: null, checkOut: null, onApprovedLeave: true,
  })
  assert.equal(c.status, 'on_leave')
  assert.equal(c.expectedMinutes, 0)
})

test('a holiday is not an absence', () => {
  const c = calculateAttendance({ dateISO: MON, schedule: standard, checkIn: null, checkOut: null, isHoliday: true })
  assert.equal(c.status, 'holiday')
  assert.equal(c.expectedMinutes, 0)
})

test('a non-workday is a rest day, not an absence', () => {
  const c = calculateAttendance({ dateISO: SAT, schedule: standard, checkIn: null, checkOut: null })
  assert.equal(c.status, 'rest_day')
  assert.equal(c.expectedMinutes, 0)
})

test('no punches on a workday is an absence', () => {
  const c = calculateAttendance({ dateISO: MON, schedule: standard, checkIn: null, checkOut: null })
  assert.equal(c.status, 'absent')
})

test('one punch is incomplete and claims zero hours rather than guessing', () => {
  const c = calculateAttendance({ dateISO: MON, schedule: standard, checkIn: at('05:00'), checkOut: null })
  assert.equal(c.status, 'incomplete')
  assert.equal(c.actualMinutes, 0)
})

test('a very short day is a half day', () => {
  const c = calculateAttendance({ dateISO: MON, schedule: standard, checkIn: at('05:00'), checkOut: at('08:00') })
  assert.equal(c.status, 'half_day')
  assert.equal(c.actualMinutes, 120)
})

test('the break is deducted and worked minutes never go negative', () => {
  const c = calculateAttendance({ dateISO: MON, schedule: standard, checkIn: at('05:00'), checkOut: at('05:30') })
  assert.equal(c.actualMinutes, 0)
})

// ─── Exceptions ─────────────────────────────────────────────────────────────

const rec = (over: Partial<AttendanceRecordLike>): AttendanceRecordLike => ({
  employee_name: 'Wallace', attendance_date: MON, status: 'present',
  late_minutes: 0, actual_minutes: 480, expected_minutes: 480,
  check_in_at: at('05:00'), check_out_at: at('14:00'), ...over,
})

test('leave, holidays and rest days never appear as exceptions', () => {
  const ex = attendanceExceptions([
    rec({ status: 'on_leave' }), rec({ status: 'holiday' }), rec({ status: 'rest_day' }),
  ])
  assert.deepEqual(ex, [])
})

test('absence, missing clock-out and lateness are exceptions', () => {
  const ex = attendanceExceptions([
    rec({ status: 'absent', actual_minutes: 0, check_in_at: null, check_out_at: null }),
    rec({ status: 'incomplete', actual_minutes: 0, check_out_at: null }),
    rec({ status: 'late', late_minutes: 25 }),
  ])
  assert.deepEqual(ex.map((e) => e.kind), ['absent', 'incomplete', 'late'])
  assert.match(ex[1].detail, /Missing clock-out/)
})

test('a missing clock-in is distinguished from a missing clock-out', () => {
  const ex = attendanceExceptions([rec({ status: 'incomplete', check_in_at: null, check_out_at: at('14:00') })])
  assert.match(ex[0].detail, /Missing clock-in/)
})

// ─── Period summary ─────────────────────────────────────────────────────────

test('approved leave leaves the denominator entirely', () => {
  // Four scheduled days, all present, plus one leave day: 100%, not 80%.
  const records = [
    rec({}), rec({}), rec({}), rec({}),
    rec({ status: 'on_leave', expected_minutes: 0, actual_minutes: 0 }),
  ]
  const s = summariseAttendance(records)
  assert.equal(s.daysScheduled, 4)
  assert.equal(s.daysOnLeave, 1)
  assert.equal(s.attendanceRate, 100)
})

test('rest days and holidays are excluded from the denominator too', () => {
  const s = summariseAttendance([rec({}), rec({ status: 'rest_day' }), rec({ status: 'holiday' })])
  assert.equal(s.daysScheduled, 1)
  assert.equal(s.attendanceRate, 100)
})

test('absence reduces the attendance rate; lateness reduces punctuality only', () => {
  const s = summariseAttendance([
    rec({}), rec({}), rec({ status: 'late', late_minutes: 20 }),
    rec({ status: 'absent', actual_minutes: 0 }),
  ])
  assert.equal(s.daysScheduled, 4)
  assert.equal(s.daysPresent, 3)
  assert.equal(s.daysLate, 1)
  assert.equal(s.attendanceRate, 75)
  assert.equal(s.punctualityRate, 67)
})

test('an empty period is zero, not NaN', () => {
  const s = summariseAttendance([])
  assert.equal(s.attendanceRate, 0)
  assert.equal(s.punctualityRate, 0)
})

test('a period made entirely of leave is not a 0% attendance record', () => {
  const s = summariseAttendance([rec({ status: 'on_leave' }), rec({ status: 'on_leave' })])
  assert.equal(s.daysScheduled, 0)
  assert.equal(s.attendanceRate, 0)   // no scheduled days: rate is undefined-as-zero
  assert.equal(s.daysOnLeave, 2)      // ...but the leave is visible, not hidden
})

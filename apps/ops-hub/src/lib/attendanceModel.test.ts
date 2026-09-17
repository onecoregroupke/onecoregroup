import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  effectiveSchedule, isWorkday, collapsePunches, calculateAttendance,
  attendanceExceptions, summariseAttendance,
  reconcileAttendanceEvidence, effectiveOpenCheckoutAt, verifiedOvertimeMinutes,
  interpretDayEvidence, interpretStoredAttendance, storedPunchAt, nairobiClock,
  type WorkSchedule, type AttendanceRecordLike,
} from './attendanceModel'

test('biometric, self-clock and reviewer evidence remain three distinct points', () => {
  const result = reconcileAttendanceEvidence([
    { id: 'bio', source: 'biometric', direction: 'in', occurred_at: '2026-09-02T08:03:00+03:00' },
    { id: 'self', source: 'employee_self', direction: 'in', occurred_at: '2026-09-02T08:05:00+03:00' },
    { id: 'manual', source: 'reviewer_manual', direction: 'in', occurred_at: '2026-09-02T08:00:00+03:00' },
  ])
  assert.equal(result.sources.size, 3)
  assert.deepEqual([...result.sources.values()].flatMap((source) => source.ids).sort(), ['bio', 'manual', 'self'])
  assert.equal(result.discrepancy, false)
})

test('system auto checkout can close a record without creating verified overtime', () => {
  assert.equal(verifiedOvertimeMinutes(120, 'system_auto'), 0)
  assert.equal(verifiedOvertimeMinutes(120, 'employee_self'), 120)
})

test('a missing checkout caps live worked time at scheduled end', () => {
  assert.equal(effectiveOpenCheckoutAt({
    nowIso: '2026-09-02T16:00:00.000Z',
    scheduledEndAt: '2026-09-02T14:00:00.000Z',
  }), '2026-09-02T14:00:00.000Z')
  assert.equal(effectiveOpenCheckoutAt({
    nowIso: '2026-09-02T10:00:00.000Z',
    scheduledEndAt: '2026-09-02T14:00:00.000Z',
  }), '2026-09-02T10:00:00.000Z')
})

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

test('a schedule with no workdays listed restricts no day, so hours are still calculated', () => {
  const unrestricted = { ...standard, workdays: [] }
  assert.equal(isWorkday(unrestricted, SAT), true)
  const c = calculateAttendance({ dateISO: SAT, schedule: unrestricted, checkIn: at('05:00', SAT), checkOut: at('14:00', SAT) })
  assert.equal(c.status, 'present')
  assert.equal(c.actualMinutes, 480)
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

// ─── The lone close-out punch ───────────────────────────────────────────────

const eat = (hhmm: string, date = MON) => new Date(`${date}T${hhmm}:00+03:00`).toISOString()
const bio = (hhmm: string, direction: 'in' | 'out' = 'in') =>
  ({ occurred_at: eat(hhmm), direction, source: 'biometric' as const })

test('the Nairobi wall clock is read at UTC+3', () => {
  assert.equal(nairobiClock('2026-09-04T14:22:00+00:00'), '17:22')
  assert.equal(nairobiClock('not-a-date'), '')
})

test('a lone punch at or after 17:00 is the close-out, never an arrival', () => {
  const r = interpretDayEvidence([bio('17:14')])
  assert.equal(r.checkIn, null)
  assert.equal(r.checkOut, eat('17:14'))
  assert.equal(r.lonePunchCloseout, true)
  assert.equal(r.checkInMissing, true)
  // No arrival → the day cannot claim hours.
  const calc = calculateAttendance({ dateISO: MON, schedule: standard, checkIn: r.checkIn, checkOut: r.checkOut })
  assert.equal(calc.status, 'incomplete')
  assert.equal(calc.actualMinutes, 0)
})

test('17:00 exactly is already the close-out; 16:59 is still an arrival', () => {
  assert.equal(interpretDayEvidence([bio('17:00')]).lonePunchCloseout, true)
  const early = interpretDayEvidence([bio('16:59')])
  assert.equal(early.checkIn, eat('16:59'))
  assert.equal(early.checkOut, null)
  assert.equal(early.checkOutMissing, true)
})

test('a lone morning punch keeps behaving as an arrival with checkout missing', () => {
  const r = interpretDayEvidence([bio('07:52')])
  assert.equal(r.checkIn, eat('07:52'))
  assert.equal(r.checkOut, null)
  assert.equal(r.lonePunchCloseout, false)
})

test('the stored direction of a device punch is not trusted — order decides', () => {
  // The importer wrote this lone evening punch as IN.
  const r = interpretDayEvidence([bio('18:05', 'in')])
  assert.equal(r.checkOut, eat('18:05'))
  assert.equal(r.checkInSource, null)
  assert.equal(r.checkOutSource, 'biometric')
})

test('two device punches are still first IN, last OUT', () => {
  const r = interpretDayEvidence([bio('17:40'), bio('08:02')])
  assert.equal(r.checkIn, eat('08:02'))
  assert.equal(r.checkOut, eat('17:40'))
  assert.equal(r.lonePunchCloseout, false)
})

test('an evening double-tap collapses to one close-out punch', () => {
  const r = interpretDayEvidence([bio('17:14'), bio('17:16', 'out')])
  assert.equal(r.checkIn, null)
  assert.equal(r.lonePunchCloseout, true)
})

test('a manually entered arrival completes the day and hours are calculated', () => {
  const r = interpretDayEvidence([
    bio('17:14'),
    { occurred_at: eat('08:00'), direction: 'in', source: 'reviewer_manual' },
  ])
  assert.equal(r.checkIn, eat('08:00'))
  assert.equal(r.checkInSource, 'reviewer_manual')
  assert.equal(r.checkOut, eat('17:14'))
  assert.equal(r.checkInMissing, false)
  const calc = calculateAttendance({ dateISO: MON, schedule: standard, checkIn: r.checkIn, checkOut: r.checkOut })
  assert.equal(calc.actualMinutes, 494)   // 9h14m minus the 1h break
})

test('a self-clock arrival pairs with the evening punch as its close-out', () => {
  const r = interpretDayEvidence([
    { occurred_at: eat('08:05'), direction: 'in', source: 'employee_self' },
    bio('17:20'),
  ])
  assert.equal(r.checkIn, eat('08:05'))
  assert.equal(r.checkOut, eat('17:20'))
})

test('a deliberate arrival after the lone punch keeps that punch an arrival', () => {
  const r = interpretDayEvidence([
    bio('17:10'),
    { occurred_at: eat('17:30'), direction: 'in', source: 'reviewer_manual' },
  ])
  assert.equal(r.checkIn, eat('17:10'))
  assert.equal(r.lonePunchCloseout, false)
})

test('an evening shift keeps its lone evening punch as the arrival', () => {
  const r = interpretDayEvidence([bio('17:25')], { scheduledStartAt: eat('17:30') })
  assert.equal(r.checkIn, eat('17:25'))
  assert.equal(r.lonePunchCloseout, false)
})

test('self-clock evidence is never reinterpreted by the device rule', () => {
  const r = interpretDayEvidence([{ occurred_at: eat('17:45'), direction: 'in', source: 'employee_self' }])
  assert.equal(r.checkIn, eat('17:45'))
  assert.equal(r.lonePunchCloseout, false)
})

test('a stored historical lone evening punch is READ as a close-out without rewriting it', () => {
  const row = {
    check_in_at: '2026-09-04T14:22:00+00:00', check_out_at: null, punch_count: 1,
    scheduled_start_at: '2026-09-04T05:00:00+00:00',
    all_punches: [{ mode: 'FP', occurred_at: '2026-09-04T14:22:00+00:00', source_row_number: 12 }],
    raw_payload: { import_id: 'x', interpretation: 'first punch IN; last punch OUT only when 2+ punches' },
  }
  const read = interpretStoredAttendance(row)
  assert.deepEqual(read, { checkIn: null, checkOut: '2026-09-04T14:22:00+00:00', lonePunchCloseout: true })
  assert.equal(row.check_in_at, '2026-09-04T14:22:00+00:00')   // the stored row is untouched
})

test('stored rows that are complete, morning, multi-punch or deliberately clocked stay as stored', () => {
  const base = { check_in_at: eat('17:30'), check_out_at: null, punch_count: 1, scheduled_start_at: eat('08:00') }
  assert.equal(interpretStoredAttendance({ ...base, check_out_at: eat('18:00') }).lonePunchCloseout, false)
  assert.equal(interpretStoredAttendance({ ...base, check_in_at: eat('07:45') }).checkIn, eat('07:45'))
  assert.equal(interpretStoredAttendance({ ...base, punch_count: 2, all_punches: [{ at: eat('08:00') }, { at: eat('17:30') }] }).checkIn, eat('17:30'))
  assert.equal(interpretStoredAttendance({ ...base, raw_payload: { check_in_source: 'employee_self' } }).checkIn, eat('17:30'))
  assert.equal(storedPunchAt({ at: eat('09:00') }), eat('09:00'))
  assert.equal(storedPunchAt({ occurred_at: 'nonsense' }), null)
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

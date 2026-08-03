import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isDutyDueOn, dueDatesBetween, lastWorkingDayOfMonth, isOverdueOccurrence } from './recurrence'

// 2026-08-03 is a Monday. 08-08 Sat, 08-09 Sun.
const MON = '2026-08-03', SAT = '2026-08-08', SUN = '2026-08-09'

test('daily is due every day', () => {
  assert.equal(isDutyDueOn({ frequency: 'daily' }, MON), true)
  assert.equal(isDutyDueOn({ frequency: 'daily' }, SUN), true)
})

test('weekdays: Mon–Fri only', () => {
  assert.equal(isDutyDueOn({ frequency: 'weekdays' }, MON), true)
  assert.equal(isDutyDueOn({ frequency: 'weekdays' }, SAT), false)
  assert.equal(isDutyDueOn({ frequency: 'weekdays' }, SUN), false)
})

test('weekly on selected weekdays', () => {
  const mondays = { frequency: 'weekly', weekdays: [1] }
  assert.equal(isDutyDueOn(mondays, MON), true)     // Monday
  assert.equal(isDutyDueOn(mondays, '2026-08-04'), false) // Tuesday
})

test('monthly on a day-of-month', () => {
  const r = { frequency: 'monthly', day_of_month: 3 }
  assert.equal(isDutyDueOn(r, '2026-08-03'), true)
  assert.equal(isDutyDueOn(r, '2026-08-04'), false)
})

test('monthly last working day (skips weekend)', () => {
  // Aug 2026 ends Mon 31 (weekday) → last working day = 31.
  assert.equal(lastWorkingDayOfMonth('2026-08-15'), '2026-08-31')
  // May 2026 ends Sun 31 → last working day = Fri 29.
  assert.equal(lastWorkingDayOfMonth('2026-05-10'), '2026-05-29')
  assert.equal(isDutyDueOn({ frequency: 'monthly', day_of_month: -1 }, '2026-05-29'), true)
  assert.equal(isDutyDueOn({ frequency: 'monthly', day_of_month: -1 }, '2026-05-31'), false)
})

test('interval: every N days from start', () => {
  const r = { frequency: 'interval', interval_days: 14, start_date: MON }
  assert.equal(isDutyDueOn(r, MON), true)
  assert.equal(isDutyDueOn(r, '2026-08-17'), true)  // +14
  assert.equal(isDutyDueOn(r, '2026-08-10'), false) // +7
})

test('start/end bounds and paused', () => {
  assert.equal(isDutyDueOn({ frequency: 'daily', start_date: '2026-08-05' }, MON), false)
  assert.equal(isDutyDueOn({ frequency: 'daily', end_date: '2026-08-02' }, MON), false)
  assert.equal(isDutyDueOn({ frequency: 'daily', paused: true }, MON), false)
  assert.equal(isDutyDueOn({ frequency: 'daily', active: false }, MON), false)
})

test('dueDatesBetween enumerates only matching days', () => {
  const dates = dueDatesBetween({ frequency: 'weekdays' }, '2026-08-03', '2026-08-09')
  assert.deepEqual(dates, ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07'])
})

test('overdue only when a past due date is incomplete', () => {
  assert.equal(isOverdueOccurrence({ frequency: 'daily' }, '2026-08-01', MON, false), true)
  assert.equal(isOverdueOccurrence({ frequency: 'daily' }, '2026-08-01', MON, true), false)  // completed
  assert.equal(isOverdueOccurrence({ frequency: 'weekdays' }, SAT, '2026-08-10', false), false) // not a due day
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { generateScheduleOccurrences } from './scheduleRules'

test('Monday Wednesday Friday recurrence creates exactly twelve bounded occurrences', () => {
  const occurrences = generateScheduleOccurrences('2026-09-07T08:30:00+03:00', '2026-09-07T10:00:00+03:00', {
    frequency: 'selected_weekdays', weekdays: [1, 3, 5], occurrenceLimit: 12,
  })
  assert.equal(occurrences.length, 12)
  assert.deepEqual(occurrences.slice(0, 4).map((row) => row.startsAt.slice(0, 10)), [
    '2026-09-07', '2026-09-09', '2026-09-11', '2026-09-14',
  ])
  assert.equal(occurrences[11]!.occurrenceNumber, 12)
})

test('recurrence must be explicitly bounded', () => {
  assert.throws(() => generateScheduleOccurrences('2026-09-07T08:30:00+03:00', null, { frequency: 'daily' }), /must end/)
})

test('recurrence hard-caps even an excessive requested count', () => {
  assert.equal(generateScheduleOccurrences('2026-01-01T08:30:00+03:00', null, {
    frequency: 'daily', occurrenceLimit: 50_000,
  }).length, 500)
})

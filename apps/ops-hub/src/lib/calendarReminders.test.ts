import assert from 'node:assert/strict'
import test from 'node:test'
import { calendarReminderDeliveryPlan } from './calendarReminders'

test('one day and thirty minute reminders have stable retry-safe identities', () => {
  const occurrenceStarts = [{ id: 'occ-1', startsAt: '2026-09-07T08:30:00+03:00' }]
  const day = calendarReminderDeliveryPlan({ ruleId: 'rule-1', occurrenceStarts, reminder: { offsetMinutes: 1440, channel: 'email' }, recipientEmail: 'Nigel@Example.com' })
  const halfHour = calendarReminderDeliveryPlan({ ruleId: 'rule-2', occurrenceStarts, reminder: { offsetMinutes: 30, channel: 'in_app' }, recipientEmail: 'Nigel@Example.com' })
  assert.equal(day.length + halfHour.length, 2)
  assert.equal(day[0]!.recipient_email, 'nigel@example.com')
  assert.equal(day[0]!.due_at, '2026-09-06T05:30:00.000Z')
  assert.deepEqual(day, calendarReminderDeliveryPlan({ ruleId: 'rule-1', occurrenceStarts, reminder: { offsetMinutes: 1440, channel: 'email' }, recipientEmail: 'Nigel@Example.com' }))
  assert.notEqual(day[0]!.idempotency_key, halfHour[0]!.idempotency_key)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { taskViewToFilter } from './taskFilters'

const TODAY = '2026-08-03' // a Monday

test('unknown / empty view adds no constraints (never silently returns all as "finance")', () => {
  assert.deepEqual(taskViewToFilter(undefined, TODAY), {})
  assert.deepEqual(taskViewToFilter('', TODAY), {})
  assert.deepEqual(taskViewToFilter('not-a-view', TODAY), {})
})

test('overdue = strictly before today, must have a due date, active only', () => {
  const f = taskViewToFilter('overdue', TODAY)
  assert.equal(f.dueBefore, '2026-08-03')
  assert.equal(f.hasDueDate, true)
  assert.equal(f.activeOnly, true)
  // Must NOT use dueOnOrBefore (that would include today, which is not overdue).
  assert.equal(f.dueOnOrBefore, undefined)
})

test('due-today is an inclusive single-day window', () => {
  const f = taskViewToFilter('due-today', TODAY)
  assert.equal(f.dueOnOrAfter, '2026-08-03')
  assert.equal(f.dueOnOrBefore, '2026-08-03')
  assert.equal(f.hasDueDate, true)
})

test('due-week spans today..+6 days inclusive', () => {
  const f = taskViewToFilter('due-week', TODAY)
  assert.equal(f.dueOnOrAfter, '2026-08-03')
  assert.equal(f.dueOnOrBefore, '2026-08-09')
})

test('grouped status/priority views map to the real lifecycle strings', () => {
  assert.deepEqual(taskViewToFilter('in-progress', TODAY).statusIn, ['Ongoing'])
  assert.deepEqual(taskViewToFilter('awaiting-review', TODAY).statusIn, ['AI Draft Ready', 'Edit Requested'])
  assert.deepEqual(taskViewToFilter('blocked', TODAY).statusIn, ['Blocked'])
  assert.deepEqual(taskViewToFilter('completed', TODAY).statusIn, ['Completed'])
  assert.deepEqual(taskViewToFilter('high-priority', TODAY).priorityIn, ['High', 'Urgent'])
})

test('due-week rolls across a month boundary correctly', () => {
  const f = taskViewToFilter('due-week', '2026-08-28')
  assert.equal(f.dueOnOrBefore, '2026-09-03')
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  orderChecklist, checklistProgress, progressLabel, isOccurrenceSettled, dutyBodyMode,
  type ChecklistItem,
} from './dutyDetail'

const item = (id: string, position: number, over: Partial<ChecklistItem & { active: boolean }> = {}) =>
  ({ id, label: `Item ${id}`, hint: '', required: true, position, active: true, ...over })

test('checklist items are shown in definition position order, not insertion order', () => {
  const ordered = orderChecklist([item('c', 2), item('a', 0), item('b', 1)])
  assert.deepEqual(ordered.map((i) => i.id), ['a', 'b', 'c'])
})

test('retired checklist items are not shown', () => {
  const ordered = orderChecklist([item('a', 0), item('b', 1, { active: false }), item('c', 2)])
  assert.deepEqual(ordered.map((i) => i.id), ['a', 'c'])
})

test('equal positions keep their original order rather than shuffling', () => {
  const ordered = orderChecklist([item('x', 0), item('y', 0), item('z', 0)])
  assert.deepEqual(ordered.map((i) => i.id), ['x', 'y', 'z'])
})

test('progress counts the ticks for the date against every shown item', () => {
  const items = [item('a', 0), item('b', 1), item('c', 2, { required: false }), item('d', 3), item('e', 4), item('f', 5)]
  const p = checklistProgress(items, { a: true, c: true, f: true, gone: true })
  assert.deepEqual(p, { done: 3, total: 6, requiredDone: 2, requiredTotal: 5 })
  assert.equal(progressLabel(p.done, p.total), '3 of 6')
})

test('an untouched date is 0 of N and a finished one is N of N', () => {
  const items = [item('a', 0), item('b', 1)]
  assert.equal(progressLabel(checklistProgress(items, {}).done, items.length), '0 of 2')
  assert.equal(progressLabel(checklistProgress(items, { a: true, b: true }).done, items.length), '2 of 2')
})

test('done and not-done-today settle an occurrence; pending does not', () => {
  assert.equal(isOccurrenceSettled('done'), true)
  assert.equal(isOccurrenceSettled('skipped'), true)
  assert.equal(isOccurrenceSettled('pending'), false)
})

test('a duty without a checklist shows its text instead of an empty checklist', () => {
  assert.equal(dutyBodyMode({ checklist: [], description: 'Wipe every piano', instructions: '' }), 'text')
  assert.equal(dutyBodyMode({ checklist: [item('a', 0)], description: 'x', instructions: 'y' }), 'checklist')
  assert.equal(dutyBodyMode({ checklist: [], description: ' ', instructions: '' }), 'empty')
})

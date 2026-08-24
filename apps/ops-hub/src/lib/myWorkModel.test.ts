import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as myWorkModel from './myWorkModel'
import {
  buildToday, buildCompleted, dedupeWork, isOverdue, isSettled, sortWork,
  isDutySettled, isTaskClosed, parseTab, WORK_KIND_LABELS, type WorkItem,
} from './myWorkModel'

const TODAY = '2026-08-24'

function duty(over: Partial<WorkItem> = {}): WorkItem {
  return {
    key: 'duty:d1:2026-08-24:m1', kind: 'duty', title: 'Opening stock check',
    dueDate: TODAY, dueAt: null, priority: 'Medium', status: 'pending', overdue: false,
    ...over,
  }
}

function task(over: Partial<WorkItem> = {}): WorkItem {
  return {
    key: 'TASK-0001', kind: 'task', title: 'Prepare supplier comparison',
    dueDate: TODAY, dueAt: null, priority: 'Medium', status: 'Ongoing', overdue: false,
    ...over,
  }
}

// ─── Duties stay duties, tasks stay tasks (§2) ──────────────────────────────

test('every item keeps its own kind — nothing is flattened into one type', () => {
  const { duties, tasks } = buildToday([duty(), task()], TODAY)
  assert.equal(duties.length, 1)
  assert.equal(duties[0]!.kind, 'duty')
  assert.equal(tasks.length, 1)
  assert.equal(tasks[0]!.kind, 'task')
})

test('the two kinds carry distinct visible labels', () => {
  assert.equal(WORK_KIND_LABELS.duty, 'Duty')
  assert.equal(WORK_KIND_LABELS.task, 'Task')
  assert.notEqual(WORK_KIND_LABELS.duty, WORK_KIND_LABELS.task)
})

test('duties and tasks appear together without either being duplicated', () => {
  const { duties, tasks, counts } = buildToday([duty(), task()], TODAY)
  assert.equal(duties.length + tasks.length, 2)
  assert.equal(counts.total, 2)
})

test('a duty also materialised as a task is ONE item, and the duty wins', () => {
  const shared = 'duty:d1:2026-08-24:m1'
  const items = [task({ key: shared }), duty({ key: shared })]
  const deduped = dedupeWork(items)
  assert.equal(deduped.length, 1)
  assert.equal(deduped[0]!.kind, 'duty')
})

test('dedupe is order-independent', () => {
  const shared = 'duty:d1:2026-08-24:m1'
  const a = dedupeWork([duty({ key: shared }), task({ key: shared })])
  const b = dedupeWork([task({ key: shared }), duty({ key: shared })])
  assert.equal(a[0]!.kind, 'duty')
  assert.equal(b[0]!.kind, 'duty')
})

// ─── Settled work leaves the outstanding lists (§42) ────────────────────────

test('a completed duty is not shown as outstanding', () => {
  const { counts, duties } = buildToday([duty({ status: 'done' })], TODAY)
  assert.equal(counts.dutiesOutstanding, 0)
  assert.equal(counts.dutiesDone, 1)
  // It stays visible, ticked — the day's record, not a hidden one.
  assert.equal(duties.length, 1)
})

test('a duty recorded as not-done today is settled, not outstanding', () => {
  assert.equal(isDutySettled('skipped'), true)
  const { counts } = buildToday([duty({ status: 'skipped' })], TODAY)
  assert.equal(counts.dutiesOutstanding, 0)
})

test('a completed task is not shown as open', () => {
  const { tasks, counts } = buildToday([task({ status: 'Completed' })], TODAY)
  assert.equal(tasks.length, 0)
  assert.equal(counts.tasksOpen, 0)
})

test('a cancelled task is not shown as open', () => {
  assert.equal(isTaskClosed('Cancelled'), true)
  assert.equal(buildToday([task({ status: 'Cancelled' })], TODAY).tasks.length, 0)
})

test('a submitted task is still open work for the employee to track', () => {
  assert.equal(isTaskClosed('Submitted'), false)
  assert.equal(buildToday([task({ status: 'Submitted' })], TODAY).tasks.length, 1)
})

test('isSettled reads the right rule per kind', () => {
  assert.equal(isSettled({ kind: 'duty', status: 'done' }), true)
  assert.equal(isSettled({ kind: 'duty', status: 'Completed' }), false)
  assert.equal(isSettled({ kind: 'task', status: 'Completed' }), true)
  assert.equal(isSettled({ kind: 'task', status: 'done' }), false)
})

// ─── Overdue classification (§6A) ───────────────────────────────────────────

test('yesterday\'s unfinished work is overdue', () => {
  assert.equal(isOverdue({ kind: 'duty', status: 'pending', dueDate: '2026-08-23', dueAt: null }, TODAY), true)
  assert.equal(isOverdue({ kind: 'task', status: 'Ongoing', dueDate: '2026-08-23', dueAt: null }, TODAY), true)
})

test('yesterday\'s FINISHED work is not overdue', () => {
  assert.equal(isOverdue({ kind: 'duty', status: 'done', dueDate: '2026-08-23', dueAt: null }, TODAY), false)
  assert.equal(isOverdue({ kind: 'task', status: 'Completed', dueDate: '2026-08-23', dueAt: null }, TODAY), false)
})

test('today\'s work is not overdue merely for being today\'s', () => {
  assert.equal(isOverdue({ kind: 'duty', status: 'pending', dueDate: TODAY, dueAt: null }, TODAY), false)
})

test('a duty past its due TIME is overdue during the same day', () => {
  const dueAt = '2026-08-24T05:00:00Z'   // 08:00 EAT
  const now = '2026-08-24T07:00:00Z'    // 10:00 EAT
  assert.equal(isOverdue({ kind: 'duty', status: 'pending', dueDate: TODAY, dueAt }, TODAY, now), true)
})

test('a duty before its due TIME is not yet overdue', () => {
  const dueAt = '2026-08-24T09:00:00Z'
  const now = '2026-08-24T07:00:00Z'
  assert.equal(isOverdue({ kind: 'duty', status: 'pending', dueDate: TODAY, dueAt }, TODAY, now), false)
})

test('undated work is never overdue', () => {
  assert.equal(isOverdue({ kind: 'task', status: 'Ongoing', dueDate: '', dueAt: null }, TODAY), false)
})

test('overdue items appear in Overdue ONLY, never twice', () => {
  const late = duty({ dueDate: '2026-08-22', status: 'pending' })
  const { overdue, duties, tasks } = buildToday([late, task()], TODAY)
  assert.equal(overdue.length, 1)
  assert.equal(duties.length, 0)
  assert.equal(tasks.length, 1)
})

test('Overdue can hold both kinds at once and keeps them distinguishable', () => {
  const { overdue } = buildToday([
    duty({ dueDate: '2026-08-22' }),
    task({ dueDate: '2026-08-21', status: 'Ongoing' }),
  ], TODAY)
  assert.equal(overdue.length, 2)
  assert.deepEqual([...new Set(overdue.map((i) => i.kind))].sort(), ['duty', 'task'])
})

// ─── Ordering ───────────────────────────────────────────────────────────────

test('overdue sorts above everything, then priority, then time', () => {
  const sorted = sortWork([
    task({ key: 'c', title: 'C', priority: 'Low', overdue: false }),
    task({ key: 'a', title: 'A', priority: 'Urgent', overdue: false }),
    task({ key: 'b', title: 'B', priority: 'Low', overdue: true }),
  ])
  assert.deepEqual(sorted.map((i) => i.key), ['b', 'a', 'c'])
})

test('items with a due time sort ahead of items without one', () => {
  const sorted = sortWork([
    duty({ key: 'anytime', dueAt: null }),
    duty({ key: 'at-eight', dueAt: '2026-08-24T05:00:00Z' }),
  ])
  assert.deepEqual(sorted.map((i) => i.key), ['at-eight', 'anytime'])
})

// ─── Completed tab (§10) ────────────────────────────────────────────────────

test('Completed shows finished work of both kinds and nothing outstanding', () => {
  const done = buildCompleted([
    duty({ key: 'd-done', status: 'done' }),
    task({ key: 't-done', status: 'Completed' }),
    duty({ key: 'd-open', status: 'pending' }),
    task({ key: 't-open', status: 'Ongoing' }),
  ])
  assert.deepEqual(done.map((i) => i.key).sort(), ['d-done', 't-done'])
})

test('Completed keeps each item\'s kind', () => {
  const done = buildCompleted([duty({ key: 'x', status: 'done' })])
  assert.equal(done[0]!.kind, 'duty')
})

test('Completed is bounded so a long history cannot flood the page', () => {
  const many = Array.from({ length: 200 }, (_, i) =>
    task({ key: `t${i}`, status: 'Completed', dueDate: '2026-08-01' }))
  assert.equal(buildCompleted(many).length, 60)
  assert.equal(buildCompleted(many, 10).length, 10)
})

// ─── Empty / degenerate input ───────────────────────────────────────────────

test('an employee with no work at all gets empty lists, not a crash', () => {
  const { overdue, duties, tasks, counts } = buildToday([], TODAY)
  assert.deepEqual([overdue, duties, tasks], [[], [], []])
  assert.equal(counts.total, 0)
})

// ─── Tab routing (§7) ───────────────────────────────────────────────────────

test('tab parsing accepts the four tabs and falls back to today', () => {
  assert.equal(parseTab('duties'), 'duties')
  assert.equal(parseTab('tasks'), 'tasks')
  assert.equal(parseTab('completed'), 'completed')
  assert.equal(parseTab('today'), 'today')
  assert.equal(parseTab('DUTIES'), 'duties')
  assert.equal(parseTab(null), 'today')
  assert.equal(parseTab('nonsense'), 'today')
})

// ─── Legacy routes stay resolvable (§11, §42) ───────────────────────────────

test('the old employee routes map onto real My Work tabs', () => {
  // /my-tasks → ?tab=tasks and /duties → ?tab=duties. If either target stopped
  // being a valid tab, those redirects would silently land on Today instead.
  assert.equal(parseTab('tasks'), 'tasks')
  assert.equal(parseTab('duties'), 'duties')
})

// ─── Rich duty requirements are not bypassed (§42) ──────────────────────────

test('the work model never decides whether a duty may be completed', () => {
  // Completion gating lives in dutyModel.validateDutyCompletion and is enforced
  // server-side. My Work only orders and buckets, so composing the page cannot
  // become a way round a rich duty's requirements.
  //
  // The exported surface is pinned deliberately: adding a completion path here
  // should fail this test and force the author to put it behind the server
  // rules instead. (buildCompleted READS finished work; it completes nothing.)
  assert.deepEqual(Object.keys(myWorkModel).sort(), [
    'MY_WORK_TABS',
    'WORK_KIND_LABELS',
    'buildCompleted',
    'buildToday',
    'dedupeWork',
    'isDutySettled',
    'isOverdue',
    'isSettled',
    'isTaskClosed',
    'parseTab',
    'sortWork',
  ])
})

test('bucketing reports a duty\'s status verbatim — it never advances it', () => {
  const { duties } = buildToday([duty({ status: 'pending' })], TODAY)
  assert.equal(duties[0]!.status, 'pending')
})

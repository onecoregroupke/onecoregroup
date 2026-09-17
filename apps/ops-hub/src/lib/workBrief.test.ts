import { test } from 'node:test'
import assert from 'node:assert/strict'
import { briefFor, briefHeadline, dutyLine, emailSections, taskLine, type BriefBuckets } from './workBrief'
import { groupMissedDuties, orderOpenTasks, type BriefLine } from './morningBrief'
import { renderMorningWorkBrief } from './email'
import type { DutyOccurrence } from './dutyOccurrences'
import type { ChecklistItem } from './dutyDetail'
import type { OcgDailyDutyRow, OpsTaskRow, OpsTeamMemberRow } from '@ocg/db'

const TODAY = '2026-09-17'
const ANN = { id: 'm-ann', name: 'Ann Wanyaga', email: 'ann@example.invalid' } as OpsTeamMemberRow

const duty = (over: Partial<OcgDailyDutyRow> = {}) => ({
  id: 'd-finance', title: 'Daily Accounts Reconciliation & Finance Duty',
  description: 'Reconcile the day’s money movements.', instructions: 'Use the shared ledger.',
  frequency: 'daily', weekdays: [], day_of_month: null, interval_days: 0,
  time_of_day: '', timezone: 'Africa/Nairobi', active: true, paused: false,
  ...over,
}) as unknown as OcgDailyDutyRow

const occurrence = (over: Partial<DutyOccurrence> = {}): DutyOccurrence => ({
  duty: duty(), date: TODAY, assignee: { id: ANN.id, name: ANN.name, email: ANN.email ?? '' },
  dueAt: null, log: null, status: 'pending', overdue: false, onTime: null,
  checklistDone: 0, checklistTotal: 6, reviewState: 'not_required', ...over,
})

const items: ChecklistItem[] = Array.from({ length: 6 }, (_, i) => ({
  id: `i${i}`, label: `Step ${i + 1}`, hint: i === 0 ? 'Start with M-Pesa' : '', required: i !== 5, position: i,
}))

const task = (over: Partial<OpsTaskRow>) => ({
  task_id: 'TASK-0001', task_name: 'Prepare VAT return', assigned_to: 'Ann Wanyaga',
  current_status: 'Ongoing', priority: 'Medium', target_date: '2026-09-20',
  scheduled_start_at: null, scheduled_end_at: null, scheduled_all_day: false,
  duty_id: null, duty_date: null, ...over,
}) as unknown as OpsTaskRow

const buckets = (over: Partial<BriefBuckets> = {}): BriefBuckets => ({
  dutiesByMember: new Map([[ANN.id, [occurrence()]]]),
  overdueByMember: new Map(),
  tasksByName: new Map(),
  apptsByMember: new Map(),
  reviewsByReviewer: new Map(),
  checklistByDuty: new Map([['d-finance', items]]),
  ...over,
})

test('a daily duty in the brief carries its whole checklist, in order, with hints', () => {
  const line = dutyLine(occurrence(), items)
  assert.equal(line.checklist?.length, 6)
  assert.deepEqual(line.checklist?.map((c) => c.label), ['Step 1', 'Step 2', 'Step 3', 'Step 4', 'Step 5', 'Step 6'])
  assert.equal(line.checklist?.[0]?.hint, 'Start with M-Pesa')
  assert.equal(line.checklist?.[5]?.required, false)
  assert.match(line.detail, /Every day · 6 checklist items/)
  // The checklist replaces the instructions; the short note stays.
  assert.equal(line.instructions, undefined)
  assert.equal(line.description, 'Reconcile the day’s money movements.')
})

test('a duty with no checklist is described by its instructions instead', () => {
  const line = dutyLine(occurrence(), [])
  assert.deepEqual(line.checklist, [])
  assert.equal(line.instructions, 'Use the shared ledger.')
})

test('progress already recorded today shows in the brief', () => {
  assert.match(dutyLine(occurrence({ checklistDone: 2 }), items).detail, /2 of 6 checklist items done/)
})

test('every uncompleted assigned task is listed — blocked and awaiting review included, closed ones not', () => {
  const brief = briefFor(ANN, TODAY, buckets({
    tasksByName: new Map([['ann wanyaga', [
      task({ task_id: 'TASK-1', current_status: 'Ongoing' }),
      task({ task_id: 'TASK-2', current_status: 'Blocked' }),
      task({ task_id: 'TASK-3', current_status: 'Under Review' }),
      task({ task_id: 'TASK-4', current_status: 'Completed' }),
      task({ task_id: 'TASK-5', current_status: 'Cancelled' }),
    ]]]),
  }))
  assert.deepEqual(brief.tasks.map((l) => l.key).sort(), ['task:TASK-1', 'task:TASK-2', 'task:TASK-3'])
  assert.equal(brief.tasks.find((l) => l.key === 'task:TASK-2')?.flag, 'blocked')
})

test('overdue tasks sit in the task list, first, flagged — not in a separate section', () => {
  const ordered = orderOpenTasks([
    task({ task_id: 'TASK-late-new', target_date: '2026-09-15' }),
    task({ task_id: 'TASK-undated', target_date: '' }),
    task({ task_id: 'TASK-due', target_date: '2026-09-18' }),
    task({ task_id: 'TASK-late-old', target_date: '2026-09-01' }),
  ], TODAY)
  assert.deepEqual(ordered.map((t) => t.task_id), ['TASK-late-old', 'TASK-late-new', 'TASK-due', 'TASK-undated'])
  assert.equal(taskLine(ordered[0]!, TODAY).flag, 'overdue')
  assert.match(taskLine(ordered[0]!, TODAY).detail, /TASK-late-old · Ongoing · due Tue 1 Sep$/)
})

test('a duty already done before the brief is not listed again', () => {
  const brief = briefFor(ANN, TODAY, buckets({ dutiesByMember: new Map([[ANN.id, [occurrence({ status: 'done' })]]]) }))
  assert.equal(brief.duties.length, 0)
})

test('a duty missed on several days is one line naming each day', () => {
  const missed = ['2026-09-14', '2026-09-16', '2026-09-15'].map((d): BriefLine => ({
    key: `duty:d1:${d}`, title: 'Finance duty', detail: d, group: 'missed:d1', date: d,
  }))
  const grouped = groupMissedDuties([...missed, { key: 'task:x', title: 'Other', detail: '' }])
  assert.equal(grouped.length, 2)
  assert.equal(grouped[0]!.detail, 'not recorded on Wed 16 Sep, Tue 15 Sep, Mon 14 Sep (3 days)')
})

test('sections come in reading order: duties, then open tasks, then the rest', () => {
  const brief = briefFor(ANN, TODAY, buckets({
    tasksByName: new Map([['ann wanyaga', [task({ target_date: '2026-09-10' })]]]),
    overdueByMember: new Map([[ANN.id, [occurrence({ date: '2026-09-16' }), occurrence({ date: '2026-09-15' })]]]),
  }))
  const sections = emailSections(brief)
  assert.deepEqual(sections.map((s) => s.label), [
    'Daily duties', 'Assigned tasks not yet completed', 'Duties not recorded on earlier days',
  ])
  assert.equal(sections[0]!.more, 0)
  assert.equal(sections[0]!.items[0]!.checklist?.length, 6)
  assert.equal(sections[2]!.items.length, 1)
  assert.equal(briefHeadline(brief), '1 duty · 1 open task (1 overdue) · 1 duty not recorded')
})

test('the email shows each checklist item and escapes what it prints', () => {
  const brief = briefFor(ANN, TODAY, buckets({
    tasksByName: new Map([['ann wanyaga', [task({ task_name: 'Chase <Glitz> invoice', target_date: '2026-09-01' })]]]),
  }))
  const html = renderMorningWorkBrief({
    to: 'ann@example.invalid', name: 'Ann', dateLabel: 'Thursday 17 September 2026',
    headline: briefHeadline(brief), workUrl: 'https://ops.example/my-work', sections: emailSections(brief),
  })
  for (let i = 1; i <= 6; i++) assert.match(html, new RegExp(`Step ${i}`))
  assert.match(html, /Start with M-Pesa/)
  assert.match(html, /\(optional\)/)
  assert.match(html, /OVERDUE/)
  assert.match(html, /Chase &lt;Glitz&gt; invoice/)
  assert.doesNotMatch(html, /<Glitz>/)
  assert.ok(html.indexOf('Daily duties') < html.indexOf('Assigned tasks not yet completed'))
})

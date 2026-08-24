import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  briefTypeForDuty, dedupeBriefItems, sortBriefItems, buildPersonalBrief,
  buildManagerBrief, unnotifiedKeys, shouldSendAssignmentEmail,
  buildWorkBrief, limitSection, BRIEF_SECTION_LIMIT,
  BRIEF_TYPE_LABELS, type BriefItem, type BriefLine,
} from './morningBrief'

const item = (over: Partial<BriefItem>): BriefItem => ({
  key: 'k1', type: 'task', title: 'Something', reference: 'TASK-1',
  dueDate: '2026-08-05', dueTime: null, priority: 'Medium', overdue: false,
  recurring: false, checklistTotal: 0,
  requiresNote: false, requiresEvidence: false, requiresApproval: false,
  href: '/tasks/TASK-1', ...over,
})

// ─── Visual distinction (§4) ────────────────────────────────────────────────

test('duty kinds map to the brief’s visual vocabulary', () => {
  assert.equal(briefTypeForDuty('inspection', false), 'inspection')
  assert.equal(briefTypeForDuty('form', false), 'form')
  assert.equal(briefTypeForDuty('task', true), 'approval')
  assert.equal(briefTypeForDuty('checklist', false), 'duty')
})

test('every brief type has a distinct label', () => {
  const labels = Object.values(BRIEF_TYPE_LABELS)
  assert.equal(new Set(labels).size, labels.length)
})

// ─── Dedupe (§2, §4) ────────────────────────────────────────────────────────

test('the same occurrence appearing twice collapses to one brief entry', () => {
  // A duty materialised into ops_tasks arrives from both feeds.
  const items = [
    item({ key: 'duty:d1:2026-08-05:m1', type: 'task', recurring: false }),
    item({ key: 'duty:d1:2026-08-05:m1', type: 'duty', recurring: true }),
  ]
  const deduped = dedupeBriefItems(items)
  assert.equal(deduped.length, 1)
})

test('the recurrence-aware entry wins the dedupe', () => {
  const deduped = dedupeBriefItems([
    item({ key: 'x', type: 'task', recurring: false, checklistTotal: 0 }),
    item({ key: 'x', type: 'duty', recurring: true, checklistTotal: 5 }),
  ])
  assert.equal(deduped[0].type, 'duty')
  assert.equal(deduped[0].checklistTotal, 5)
})

test('dedupe order does not change the outcome', () => {
  const a = dedupeBriefItems([item({ key: 'x', recurring: true }), item({ key: 'x', recurring: false })])
  const b = dedupeBriefItems([item({ key: 'x', recurring: false }), item({ key: 'x', recurring: true })])
  assert.equal(a[0].recurring, true)
  assert.equal(b[0].recurring, true)
})

test('genuinely different occurrences are all kept', () => {
  const deduped = dedupeBriefItems([
    item({ key: 'duty:d1:2026-08-05:m1' }),
    item({ key: 'duty:d1:2026-08-06:m1' }),   // next day
    item({ key: 'duty:d1:2026-08-05:m2' }),   // different person
  ])
  assert.equal(deduped.length, 3)
})

// ─── Ordering ───────────────────────────────────────────────────────────────

test('overdue sorts above everything, then priority, then due time', () => {
  const sorted = sortBriefItems([
    item({ key: 'a', priority: 'Low' }),
    item({ key: 'b', priority: 'Urgent' }),
    item({ key: 'c', priority: 'Low', overdue: true }),
    item({ key: 'd', priority: 'Urgent', dueTime: '06:00' }),
  ])
  assert.deepEqual(sorted.map((i) => i.key), ['c', 'd', 'b', 'a'])
})

test('an unknown priority sorts as medium rather than dropping out', () => {
  const sorted = sortBriefItems([
    item({ key: 'a', priority: 'Low' }),
    item({ key: 'b', priority: 'Nonsense' }),
  ])
  assert.deepEqual(sorted.map((i) => i.key), ['b', 'a'])
})

// ─── Personal brief (§4) ────────────────────────────────────────────────────

test('the brief counts tasks and duties separately', () => {
  const brief = buildPersonalBrief({
    recipientName: 'Shamim', recipientEmail: 's@x.com', date: '2026-08-05',
    items: [
      item({ key: '1', type: 'task' }),
      item({ key: '2', type: 'duty' }),
      item({ key: '3', type: 'inspection' }),
      item({ key: '4', type: 'task', overdue: true }),
      item({ key: '5', type: 'duty', overdue: true }),
    ],
  })
  assert.equal(brief.counts.tasksToday, 1)
  assert.equal(brief.counts.dutiesToday, 2)   // duty + inspection
  assert.equal(brief.counts.overdueTasks, 1)
  assert.equal(brief.counts.overdueDuties, 1)
  assert.equal(brief.counts.total, 5)
})

test('overdue items are separated from what is due today', () => {
  const brief = buildPersonalBrief({
    recipientName: 'Shamim', recipientEmail: 's@x.com', date: '2026-08-05',
    items: [item({ key: '1' }), item({ key: '2', overdue: true })],
  })
  assert.equal(brief.dueToday.length, 1)
  assert.equal(brief.overdue.length, 1)
})

test('a person with nothing due gets an empty brief and therefore no email', () => {
  // §4 warns against a repetitive stream; a daily "you have 0 items" is exactly
  // that.
  const brief = buildPersonalBrief({
    recipientName: 'Shamim', recipientEmail: 's@x.com', date: '2026-08-05', items: [],
  })
  assert.equal(brief.isEmpty, true)
})

test('the brief deduplicates before counting', () => {
  const brief = buildPersonalBrief({
    recipientName: 'Shamim', recipientEmail: 's@x.com', date: '2026-08-05',
    items: [item({ key: 'x', type: 'task' }), item({ key: 'x', type: 'duty', recurring: true })],
  })
  assert.equal(brief.counts.total, 1)
})

// ─── Manager brief (§4) ─────────────────────────────────────────────────────

const emptyManager = {
  managerName: 'Anthony', managerEmail: 'a@x.com', date: '2026-08-05',
  teamDutiesDueToday: 0, teamDutiesMissedYesterday: [], criticalOverdue: [],
  escalatedInspections: [], attendanceExceptions: [], inventoryAlerts: [], pendingReviews: 0,
}

test('a quiet morning produces no manager email', () => {
  const brief = buildManagerBrief(emptyManager)
  assert.equal(brief.isEmpty, true)
  assert.equal(brief.headline, 'Nothing needing attention')
})

test('duties due today alone do not make a manager brief worth sending', () => {
  // Volume is not an exception. Only things needing attention are.
  const brief = buildManagerBrief({ ...emptyManager, teamDutiesDueToday: 14 })
  assert.equal(brief.isEmpty, true)
})

test('the headline summarises every signal present', () => {
  const brief = buildManagerBrief({
    ...emptyManager,
    criticalOverdue: [{ reference: 'TASK-9', title: 'x', assignee: 'Wallace', daysOverdue: 3 }],
    attendanceExceptions: [{ employee: 'Gumi', detail: 'Missing clock-out' }],
    inventoryAlerts: [{ item: '1L bottle', location: 'Store', usable: 40, reorderLevel: 200 }],
    pendingReviews: 2,
  })
  assert.equal(brief.isEmpty, false)
  assert.match(brief.headline, /1 critical overdue/)
  assert.match(brief.headline, /1 attendance exceptions/)
  assert.match(brief.headline, /1 stock alerts/)
  assert.match(brief.headline, /2 awaiting review/)
})

// ─── Send-once (§4) ─────────────────────────────────────────────────────────

test('an occurrence already notified today is not notified again', () => {
  const items = [item({ key: 'a' }), item({ key: 'b' })]
  assert.deepEqual(unnotifiedKeys(items, ['a']), ['b'])
})

test('a re-run of the brief job notifies nobody twice', () => {
  const items = [item({ key: 'a' }), item({ key: 'b' })]
  const first = unnotifiedKeys(items, [])
  assert.deepEqual(first, ['a', 'b'])
  assert.deepEqual(unnotifiedKeys(items, first), [])
})

test('the assignment email is sent once and never re-triggered by an edit', () => {
  assert.equal(shouldSendAssignmentEmail({ assignee_id: 'm1' }), true)
  assert.equal(shouldSendAssignmentEmail({ assignee_id: 'm1', assignment_email_sent_at: '2026-08-01T06:00:00Z' }), false)
})

test('no assignment email for an unassigned, inactive or paused duty', () => {
  assert.equal(shouldSendAssignmentEmail({ assignee_id: null }), false)
  assert.equal(shouldSendAssignmentEmail({ assignee_id: 'm1', active: false }), false)
  assert.equal(shouldSendAssignmentEmail({ assignee_id: 'm1', paused: true }), false)
})

// ─── Morning Work Brief (§§18–21, §43) ──────────────────────────────────────

const line = (key: string, title = key, detail = ''): BriefLine => ({ key, title, detail })

test('a brief with only tasks lists them and nothing else', () => {
  const brief = buildWorkBrief({
    recipientName: 'Allan', recipientEmail: 'a@x.com', date: '2026-08-24',
    duties: [], tasks: [line('task:T-1', 'Prepare supplier comparison')],
  })
  assert.equal(brief.counts.tasks, 1)
  assert.equal(brief.counts.duties, 0)
  assert.equal(brief.isEmpty, false)
  assert.match(brief.headline, /1 task/)
})

test('a brief with only duties lists them and nothing else', () => {
  const brief = buildWorkBrief({
    recipientName: 'Allan', recipientEmail: 'a@x.com', date: '2026-08-24',
    duties: [line('duty:d1:2026-08-24:m1', 'Opening stock check')], tasks: [],
  })
  assert.equal(brief.counts.duties, 1)
  assert.equal(brief.counts.tasks, 0)
  assert.match(brief.headline, /1 duty/)
})

test('a brief carries duties AND tasks together, still distinguishable', () => {
  const brief = buildWorkBrief({
    recipientName: 'Allan', recipientEmail: 'a@x.com', date: '2026-08-24',
    duties: [line('duty:d1:2026-08-24:m1')], tasks: [line('task:T-1')],
  })
  assert.equal(brief.counts.total, 2)
  assert.equal(brief.duties.length, 1)
  assert.equal(brief.tasks.length, 1)
  assert.match(brief.headline, /1 duty · 1 task/)
})

test('nothing actionable produces an empty brief so no email is sent', () => {
  const brief = buildWorkBrief({
    recipientName: 'Allan', recipientEmail: 'a@x.com', date: '2026-08-24',
    duties: [], tasks: [],
  })
  assert.equal(brief.isEmpty, true)
  assert.equal(brief.headline, 'Nothing outstanding')
})

test('an overdue item is chased once — never in Overdue AND in its own section', () => {
  const late = line('duty:d1:2026-08-23:m1', 'Yesterday closing report')
  const brief = buildWorkBrief({
    recipientName: 'Allan', recipientEmail: 'a@x.com', date: '2026-08-24',
    duties: [late, line('duty:d2:2026-08-24:m1')], tasks: [],
    overdue: [late],
  })
  assert.equal(brief.overdue.length, 1)
  assert.equal(brief.duties.length, 1)
  assert.equal(brief.duties.some((l) => l.key === late.key), false)
})

test('overdue duties and overdue tasks both reach the brief', () => {
  const brief = buildWorkBrief({
    recipientName: 'Allan', recipientEmail: 'a@x.com', date: '2026-08-24',
    duties: [], tasks: [],
    overdue: [line('duty:d1:2026-08-22:m1'), line('task:T-9')],
  })
  assert.equal(brief.counts.overdue, 2)
  assert.equal(brief.isEmpty, false)
})

test('one duty occurrence cannot appear twice in a brief', () => {
  const key = 'duty:d1:2026-08-24:m1'
  const brief = buildWorkBrief({
    recipientName: 'Allan', recipientEmail: 'a@x.com', date: '2026-08-24',
    // The same occurrence arriving from both the duty feed and a materialised task.
    duties: [line(key, 'Opening stock check')], tasks: [line(key, 'Opening stock check')],
  })
  assert.equal(brief.counts.total, 1)
})

test('a repeated key within one section collapses too', () => {
  const brief = buildWorkBrief({
    recipientName: 'Allan', recipientEmail: 'a@x.com', date: '2026-08-24',
    duties: [line('duty:d1:2026-08-24:m1'), line('duty:d1:2026-08-24:m1')], tasks: [],
  })
  assert.equal(brief.duties.length, 1)
})

test('reviews reach only the brief they were attributed to', () => {
  const brief = buildWorkBrief({
    recipientName: 'Fatma', recipientEmail: 'f@x.com', date: '2026-08-24',
    duties: [], tasks: [], reviews: [line('review:l1', 'Staff Diary', 'Jane')],
  })
  assert.equal(brief.counts.reviews, 1)
  assert.match(brief.headline, /1 to review/)
})

test('a review alone is enough to warrant an email', () => {
  const brief = buildWorkBrief({
    recipientName: 'Fatma', recipientEmail: 'f@x.com', date: '2026-08-24',
    duties: [], tasks: [], reviews: [line('review:l1')],
  })
  assert.equal(brief.isEmpty, false)
})

test('appointments appear as their own section', () => {
  const brief = buildWorkBrief({
    recipientName: 'Allan', recipientEmail: 'a@x.com', date: '2026-08-24',
    duties: [], tasks: [], appointments: [line('appointment:a1', 'Production planning', '10:00')],
  })
  assert.equal(brief.counts.appointments, 1)
  assert.equal(brief.appointments[0]!.detail, '10:00')
})

test('sections are bounded and report what was trimmed', () => {
  const many = Array.from({ length: 20 }, (_, i) => line(`k${i}`))
  const { shown, more } = limitSection(many)
  assert.equal(shown.length, BRIEF_SECTION_LIMIT)
  assert.equal(more, 20 - BRIEF_SECTION_LIMIT)
})

test('a short section is not trimmed and reports nothing extra', () => {
  const { shown, more } = limitSection([line('a'), line('b')])
  assert.equal(shown.length, 2)
  assert.equal(more, 0)
})

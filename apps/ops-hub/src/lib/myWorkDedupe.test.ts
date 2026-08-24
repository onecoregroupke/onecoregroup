import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dutyToWorkItem, taskToWorkItem, dutyOccurrenceKey } from './myWork'
import { buildToday, dedupeWork } from './myWorkModel'
import type { OccurrenceDto } from '@/components/duties/DutyOccurrenceCard'
import type { OpsTaskRow } from '@ocg/db'

// =============================================================================
// §49: a duty occurrence and the task materialised from it must collapse into
// ONE displayed item.
//
// The previous implementation intended this but the two sides built different
// keys — the duty appended the assignee id, the task appended an empty string —
// so they never matched and both were shown.
//
// These tests build the REAL shapes the two producers consume (an OccurrenceDto
// as dutyView emits it, an OpsTaskRow as the database returns it) rather than
// hand-writing two identical keys, which would assert nothing.
// =============================================================================

const DUTY_ID = 'a1b2c3d4-0000-4000-8000-000000000001'
const MEMBER_ID = 'f0f0f0f0-0000-4000-8000-0000000000aa'
const DATE = '2026-08-26'

/** An occurrence exactly as toOccurrenceDtos() produces it. */
function occurrence(over: Partial<OccurrenceDto> = {}): OccurrenceDto {
  return {
    dutyId: DUTY_ID,
    date: DATE,
    title: 'Opening finished-goods stock check',
    description: '',
    instructions: '',
    dutyKind: 'task',
    priority: 'Medium',
    category: '',
    location: '',
    assigneeId: MEMBER_ID,
    assigneeName: 'Allan',
    dueAt: null,
    status: 'pending',
    overdue: false,
    onTime: null,
    reviewState: 'not_required',
    reviewComment: '',
    reviewerName: '',
    reviewedBy: '',
    reviewedAt: null,
    requiredFormTemplateId: null,
    formSubmissionId: null,
    note: '',
    checklistDone: 0,
    checklistTotal: 0,
    requiresNote: false,
    requiresProof: false,
    requiresChecklist: false,
    requiresApproval: false,
    checklist: [],
    checked: {},
    ...over,
  }
}

/** A task row exactly as ops_tasks returns it. */
function taskRow(over: Partial<OpsTaskRow> = {}): OpsTaskRow {
  return {
    task_id: 'TASK-0042',
    dropdown_label: 'TASK-0042 — Opening finished-goods stock check',
    project_id: 'PROJ-001',
    project_name: 'Iceland production',
    brand_id: null,
    client_id: '',
    task_name: 'Opening finished-goods stock check',
    task_description: '',
    assigned_to: 'Allan',
    category: 'Operations',
    priority: 'Medium',
    start_date: DATE,
    target_date: DATE,
    current_status: 'Not Started',
    last_updated_by: '',
    last_updated_date: '',
    latest_work_comment: '',
    active: 'Yes',
    notes: '',
    hmac_token: null,
    agent_eligible: 'Yes',
    source_kind: null,
    source_ref: null,
    created_at: '',
    updated_at: '',
    requires_note: false,
    requires_evidence: false,
    requires_approval: false,
    requires_checklist: false,
    required_form_template_id: null,
    reviewer_id: null,
    // The materialisation link migration 057 sets.
    duty_id: DUTY_ID,
    duty_date: DATE,
    submitted_at: null,
    reopened_count: 0,
    scheduled_start_at: null,
    scheduled_end_at: null,
    scheduled_all_day: false,
    scheduled_location: '',
    ...over,
  }
}

test('a duty occurrence and its materialised task produce the SAME key', () => {
  // This is the assertion the old implementation failed. Both keys are derived
  // from the real producers, not written by hand.
  const dutyKey = dutyToWorkItem(occurrence()).key
  const taskKey = taskToWorkItem(taskRow()).key
  assert.equal(dutyKey, taskKey)
  assert.equal(dutyKey, dutyOccurrenceKey(DUTY_ID, DATE))
})

test('the pair collapses to one item, and the DUTY wins', () => {
  const items = [taskToWorkItem(taskRow()), dutyToWorkItem(occurrence())]
  const deduped = dedupeWork(items)
  assert.equal(deduped.length, 1)
  assert.equal(deduped[0]!.kind, 'duty')
})

test('My Work never shows the same underlying duty as both a Duty and a Task', () => {
  const { duties, tasks, overdue } = buildToday(
    [dutyToWorkItem(occurrence()), taskToWorkItem(taskRow())],
    DATE,
  )
  const shown = [...duties, ...tasks, ...overdue]
  assert.equal(shown.length, 1)
  assert.equal(shown[0]!.kind, 'duty')
  assert.equal(shown[0]!.title, 'Opening finished-goods stock check')
})

test('the key ignores the assignee, because each surface is already one person', () => {
  // A different assignee id on the duty side must not split the pair — this is
  // exactly the difference that broke it before.
  const a = dutyToWorkItem(occurrence({ assigneeId: MEMBER_ID })).key
  const b = dutyToWorkItem(occurrence({ assigneeId: 'someone-else' })).key
  assert.equal(a, b)
  assert.equal(a, taskToWorkItem(taskRow()).key)
})

test('an ORDINARY task is never merged into a duty', () => {
  // A task with no duty_id keys on its own id and stays a task.
  const ordinary = taskToWorkItem(taskRow({ duty_id: null, duty_date: null, task_id: 'TASK-0099' }))
  assert.equal(ordinary.key, 'TASK-0099')
  const { duties, tasks } = buildToday([dutyToWorkItem(occurrence()), ordinary], DATE)
  assert.equal(duties.length, 1)
  assert.equal(tasks.length, 1)
})

test('duty occurrences on different DATES remain separate items', () => {
  const monday = dutyToWorkItem(occurrence({ date: '2026-08-24' }))
  const tuesday = dutyToWorkItem(occurrence({ date: '2026-08-25' }))
  assert.notEqual(monday.key, tuesday.key)
  assert.equal(dedupeWork([monday, tuesday]).length, 2)
})

test('different duties on the same date remain separate items', () => {
  const a = dutyToWorkItem(occurrence({ dutyId: DUTY_ID }))
  const b = dutyToWorkItem(occurrence({ dutyId: 'a1b2c3d4-0000-4000-8000-000000000002' }))
  assert.notEqual(a.key, b.key)
  assert.equal(dedupeWork([a, b]).length, 2)
})

// ─── Scheduled tasks in My Work (§44) ───────────────────────────────────────

test('a scheduled task is relevant on the day it is SCHEDULED, not its deadline', () => {
  const item = taskToWorkItem(taskRow({
    duty_id: null, duty_date: null,
    scheduled_start_at: '2026-08-26T07:00:00Z',   // 10:00 Nairobi
    scheduled_end_at: '2026-08-26T09:00:00Z',
    target_date: '2026-08-28',                    // due Friday
  }))
  assert.equal(item.dueDate, '2026-08-26')
  assert.equal(item.dueAt, '2026-08-26T07:00:00Z')
})

test('an all-day scheduled task lands on its day with no time', () => {
  const item = taskToWorkItem(taskRow({
    duty_id: null, duty_date: null,
    scheduled_start_at: '2026-08-26T00:00:00+03:00',
    scheduled_all_day: true,
    target_date: '2026-08-28',
  }))
  assert.equal(item.dueDate, '2026-08-26')
  assert.equal(item.dueAt, null)
})

test('an unscheduled task still uses its deadline, exactly as before', () => {
  const item = taskToWorkItem(taskRow({ duty_id: null, duty_date: null, target_date: '2026-08-28' }))
  assert.equal(item.dueDate, '2026-08-28')
  assert.equal(item.dueAt, null)
})

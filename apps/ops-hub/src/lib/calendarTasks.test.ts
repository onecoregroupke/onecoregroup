import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canAssignTaskFromCalendar, assignableProjects, assignablePeople, canAssignToMember,
  buildTaskPayload, validateTaskForm, initialTaskForm, scheduleWindow,
  nairobiInstant, formatScheduleRange, nairobiDateOf,
} from './calendarTasks'
import type { TaskScope } from './permissions'

const BRAND_GLITZ = '11111111-1111-1111-1111-111111111111'
const BRAND_NPT = '22222222-2222-2222-2222-222222222222'

const ALL: TaskScope = { kind: 'all' }
const OWN: TaskScope = { kind: 'own' }
const GLITZ_ONLY: TaskScope = { kind: 'brands', brandIds: [BRAND_GLITZ] }

// ─── Who may assign (§23, §44) ──────────────────────────────────────────────

test('a user without ops edit cannot assign a task from the calendar', () => {
  assert.equal(canAssignTaskFromCalendar({}, false), false)
  assert.equal(canAssignTaskFromCalendar({ ops: 'view' }, false), false)
})

test('an ops editor can assign', () => {
  assert.equal(canAssignTaskFromCalendar({ ops: 'edit' }, false), true)
})

test('a super admin can assign', () => {
  assert.equal(canAssignTaskFromCalendar({ ops: 'view' }, true), true)
})

test('the founding admin can assign', () => {
  assert.equal(canAssignTaskFromCalendar(null, false), true)
})

test('calendar authority matches the task endpoint own rule exactly', () => {
  // The API gate is: actor.can('ops','edit') || actor.isSuperAdmin. If this
  // helper ever drifts from it, the menu and the endpoint disagree.
  const cases: Array<[Parameters<typeof canAssignTaskFromCalendar>[0], boolean]> = [
    [{}, false], [{ ops: 'view' }, false], [{ ops: 'edit' }, false], [null, false],
  ]
  for (const [permissions, isSuperAdmin] of cases) {
    const expected = (permissions === null) || permissions.ops === 'edit' || isSuperAdmin
    assert.equal(canAssignTaskFromCalendar(permissions, isSuperAdmin), expected)
  }
})

// ─── Brand scope (§24, §44) ─────────────────────────────────────────────────

const projects = [
  { id: 'PROJ-001', label: 'Glitz production', brandId: BRAND_GLITZ, brandLabel: 'Glitz' },
  { id: 'PROJ-002', label: 'NPT service', brandId: BRAND_NPT, brandLabel: 'NPT' },
  { id: 'PROJ-003', label: 'Group admin', brandId: null, brandLabel: '' },
]

test('an unrestricted assigner sees every project', () => {
  assert.equal(assignableProjects(projects, ALL).length, 3)
})

test('a brand manager only sees their own entity projects', () => {
  const shown = assignableProjects(projects, GLITZ_ONLY)
  assert.deepEqual(shown.map((p) => p.id), ['PROJ-001'])
})

test('a brand manager cannot assign under a group (brand-less) project', () => {
  assert.equal(assignableProjects(projects, GLITZ_ONLY).some((p) => p.brandId === null), false)
})

const people = [
  { id: 'm1', name: 'Shamim', brandIds: [BRAND_GLITZ] },
  { id: 'm2', name: 'Wallace', brandIds: [BRAND_GLITZ, BRAND_NPT] },
  { id: 'm3', name: 'Gumi', brandIds: [BRAND_NPT] },
  { id: 'm4', name: 'Unassigned', brandIds: [] },
]

test('an unrestricted assigner sees the whole team', () => {
  assert.equal(assignablePeople(people, ALL).length, 4)
})

test('a brand manager only sees people in their brands', () => {
  const shown = assignablePeople(people, GLITZ_ONLY)
  assert.deepEqual(shown.map((m) => m.name), ['Shamim', 'Wallace'])
})

test('an own-scope actor is not offered a brand-narrowed list', () => {
  // 'own' never reaches the composer at all (canAssignTaskFromCalendar gates
  // that), so the filter must not silently invent a narrowing here.
  assert.equal(assignablePeople(people, OWN).length, 4)
})

// ─── Server-side assignee scope (§46, §61) ──────────────────────────────────

test('a brand manager may assign to someone sharing one of their brands', () => {
  assert.equal(canAssignToMember(GLITZ_ONLY, [BRAND_GLITZ]), true)
  assert.equal(canAssignToMember(GLITZ_ONLY, [BRAND_GLITZ, BRAND_NPT]), true)
})

test('a brand manager may NOT assign to someone outside their brands', () => {
  // The crafted-POST case: an in-scope project, but an employee nowhere near
  // that entity. The filtered dropdown never saw this request.
  assert.equal(canAssignToMember(GLITZ_ONLY, [BRAND_NPT]), false)
})

test('an assignee with no brands at all is refused by a scoped manager', () => {
  assert.equal(canAssignToMember(GLITZ_ONLY, []), false)
})

test('an unresolvable assignee is refused rather than allowed through', () => {
  // "We could not work out who this is" must never resolve to "that is fine".
  assert.equal(canAssignToMember(GLITZ_ONLY, null), false)
})

test('an unrestricted assigner may assign to anyone', () => {
  assert.equal(canAssignToMember(ALL, [BRAND_NPT]), true)
  assert.equal(canAssignToMember(ALL, null), true)
  assert.equal(canAssignToMember(ALL, []), true)
})

// ─── Schedule versus deadline (§41, §60) ────────────────────────────────────

const scheduled = (over: Partial<ReturnType<typeof initialTaskForm>> = {}) => ({
  ...initialTaskForm('2026-08-26', 'PROJ-001'),
  task_name: 'Prepare supplier comparison',
  ...over,
})

test('the clicked calendar day prefills the SCHEDULE date, not only the deadline', () => {
  const form = initialTaskForm('2026-08-26', 'PROJ-001')
  assert.equal(form.schedule_date, '2026-08-26')
})

test('the deadline starts on the same day but is an independent field', () => {
  const form = initialTaskForm('2026-08-26', 'PROJ-001')
  assert.equal(form.target_date, '2026-08-26')
  const edited = { ...form, target_date: '2026-08-28' }
  assert.equal(edited.schedule_date, '2026-08-26')
  assert.equal(edited.target_date, '2026-08-28')
})

test('a schedule becomes a Nairobi-anchored instant window', () => {
  const w = scheduleWindow(scheduled({ start_time: '10:00', end_time: '12:00' }))
  assert.equal(w.start, '2026-08-26T10:00:00+03:00')
  assert.equal(w.end, '2026-08-26T12:00:00+03:00')
  assert.equal(w.allDay, false)
})

test('Nairobi 10:00 is 07:00 UTC — the offset is real, not decorative', () => {
  const iso = nairobiInstant('2026-08-26', '10:00')
  assert.equal(new Date(iso).toISOString(), '2026-08-26T07:00:00.000Z')
})

test('an all-day schedule spans the whole Nairobi day', () => {
  const w = scheduleWindow(scheduled({ all_day: true }))
  assert.equal(w.allDay, true)
  assert.equal(w.start, '2026-08-26T00:00:00+03:00')
  assert.equal(w.end, '2026-08-26T23:59:00+03:00')
})

test('no schedule date means no window at all — a deadline-only task', () => {
  const w = scheduleWindow(scheduled({ schedule_date: '' }))
  assert.deepEqual(w, { start: null, end: null, allDay: false })
})

test('the payload carries the schedule AND the deadline, separately', () => {
  const payload = buildTaskPayload(scheduled({
    start_time: '10:00', end_time: '12:00', target_date: '2026-08-28', assigned_to: 'Wallace',
  }))
  assert.equal(payload.scheduled_start_at, '2026-08-26T10:00:00+03:00')
  assert.equal(payload.scheduled_end_at, '2026-08-26T12:00:00+03:00')
  assert.equal(payload.scheduled_all_day, false)
  // Scheduled Wednesday, due Friday — the case the whole model exists for.
  assert.equal(payload.target_date, '2026-08-28')
  assert.equal(payload.assigned_to, 'Wallace')
})

test('a deadline-only task sends null schedule fields, not a fabricated window', () => {
  const payload = buildTaskPayload(scheduled({ schedule_date: '', target_date: '2026-08-28' }))
  assert.equal(payload.scheduled_start_at, null)
  assert.equal(payload.scheduled_end_at, null)
  assert.equal(payload.scheduled_all_day, false)
  assert.equal(payload.target_date, '2026-08-28')
})

test('location travels with the schedule when supplied', () => {
  const payload = buildTaskPayload(scheduled({ location: '  Workshop  ' }))
  assert.equal(payload.scheduled_location, 'Workshop')
})

test('the payload carries NO brand — brand is inherited from the project', () => {
  assert.equal('brand_id' in buildTaskPayload(scheduled()), false)
})

test('the payload has no calendar-event fields — no shadow event is implied', () => {
  // §45: creating a scheduled task must not smuggle an event shape into the
  // task engine, and must not imply a second record.
  assert.deepEqual(Object.keys(buildTaskPayload(scheduled())).sort(), [
    'assigned_to', 'category', 'priority', 'project_id',
    'scheduled_all_day', 'scheduled_end_at', 'scheduled_location', 'scheduled_start_at',
    'target_date', 'task_description', 'task_name',
  ])
})

// ─── Validation (§42) ───────────────────────────────────────────────────────

test('an end time before the start time is rejected', () => {
  const problem = validateTaskForm(scheduled({ start_time: '12:00', end_time: '10:00' }))
  assert.match(problem ?? '', /end time is before/i)
})

test('equal start and end times are allowed', () => {
  assert.equal(validateTaskForm(scheduled({ start_time: '10:00', end_time: '10:00' })), null)
})

test('an all-day schedule needs no times', () => {
  assert.equal(validateTaskForm(scheduled({ all_day: true, start_time: '', end_time: '' })), null)
})

test('a deadline before the scheduled day is rejected as incoherent', () => {
  const problem = validateTaskForm(scheduled({ schedule_date: '2026-08-26', target_date: '2026-08-24' }))
  assert.match(problem ?? '', /deadline is before/i)
})

test('a deadline after the scheduled day is the normal case', () => {
  assert.equal(validateTaskForm(scheduled({ schedule_date: '2026-08-26', target_date: '2026-08-28' })), null)
})

test('a task still needs a title and a project', () => {
  assert.match(validateTaskForm(scheduled({ task_name: '   ' })) ?? '', /title/)
  assert.match(validateTaskForm(scheduled({ project_id: '' })) ?? '', /project/)
})

// ─── Display (§43) ──────────────────────────────────────────────────────────

test('a scheduled window renders as a Nairobi time range', () => {
  assert.equal(
    formatScheduleRange('2026-08-26T07:00:00Z', '2026-08-26T09:00:00Z'),
    '10:00–12:00',
  )
})

test('an all-day scheduled task reads as All day, not 00:00 to 23:59', () => {
  assert.equal(formatScheduleRange('2026-08-26T00:00:00+03:00', null, true), 'All day')
})

test('an unscheduled task renders no range at all', () => {
  assert.equal(formatScheduleRange(null, null), '')
})

test('a scheduled instant resolves to its Nairobi calendar date', () => {
  // 22:30 UTC is already the next day in Nairobi — the chip must land there.
  assert.equal(nairobiDateOf('2026-08-25T22:30:00Z'), '2026-08-26')
  assert.equal(nairobiDateOf('2026-08-26T07:00:00Z'), '2026-08-26')
})

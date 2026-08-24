import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canAssignTaskFromCalendar, assignableProjects, assignablePeople,
  buildTaskPayload, validateTaskForm, initialTaskForm,
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

test('calendar authority matches the task endpoint\'s own rule exactly', () => {
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

test('a brand manager only sees their own brand\'s projects', () => {
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

test('an own-scope actor is not offered a brand-narrowed list — they see all', () => {
  // 'own' never reaches the composer at all (canAssignTaskFromCalendar gates
  // that), so the filter must not silently invent a narrowing here.
  assert.equal(assignablePeople(people, OWN).length, 4)
})

// ─── The payload (§25, §44) ─────────────────────────────────────────────────

test('the clicked calendar date becomes the initial target date', () => {
  const form = initialTaskForm('2026-08-24', 'PROJ-001')
  assert.equal(form.target_date, '2026-08-24')
  assert.equal(form.project_id, 'PROJ-001')
})

test('the payload carries assignee, project, priority, category and date', () => {
  const payload = buildTaskPayload({
    task_name: '  Prepare supplier comparison  ',
    project_id: 'PROJ-001',
    assigned_to: 'Wallace',
    priority: 'High',
    category: 'Operations',
    target_date: '2026-08-26',
    task_description: 'Three quotes, like for like.',
  })
  assert.deepEqual(payload, {
    task_name: 'Prepare supplier comparison',
    project_id: 'PROJ-001',
    assigned_to: 'Wallace',
    priority: 'High',
    category: 'Operations',
    target_date: '2026-08-26',
    task_description: 'Three quotes, like for like.',
  })
})

test('the payload carries NO brand — brand is inherited from the project', () => {
  // Sending a brand would create a second opinion about which brand owns the
  // task, and eventually a disagreement with the project it hangs off.
  const payload = buildTaskPayload(initialTaskForm('2026-08-24', 'PROJ-001'))
  assert.equal('brand_id' in payload, false)
})

test('the payload has no calendar-specific fields at all', () => {
  // §25: the calendar must not smuggle an event shape into the task engine.
  const payload = buildTaskPayload(initialTaskForm('2026-08-24', 'PROJ-001'))
  assert.deepEqual(Object.keys(payload).sort(), [
    'assigned_to', 'category', 'priority', 'project_id',
    'target_date', 'task_description', 'task_name',
  ])
})

test('a user may change the prefilled date before submitting', () => {
  const form = { ...initialTaskForm('2026-08-24', 'PROJ-001'), target_date: '2026-09-01' }
  assert.equal(buildTaskPayload(form).target_date, '2026-09-01')
})

test('an unassigned task is allowed — the payload just carries an empty assignee', () => {
  const form = { ...initialTaskForm('2026-08-24', 'PROJ-001'), task_name: 'Draft policy' }
  assert.equal(buildTaskPayload(form).assigned_to, '')
})

// ─── Validation ─────────────────────────────────────────────────────────────

test('a task needs a title and a project', () => {
  const base = initialTaskForm('2026-08-24', '')
  assert.match(validateTaskForm(base) ?? '', /title/)
  assert.match(validateTaskForm({ ...base, task_name: 'X' }) ?? '', /project/)
  assert.equal(validateTaskForm({ ...base, task_name: 'X', project_id: 'PROJ-001' }), null)
})

test('a whitespace-only title is not a title', () => {
  const form = { ...initialTaskForm('2026-08-24', 'PROJ-001'), task_name: '   ' }
  assert.notEqual(validateTaskForm(form), null)
})

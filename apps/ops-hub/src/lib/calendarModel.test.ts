import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canSeeEvent, calendarPeopleScope, canCreateEvent, canReschedule,
  viewWindow, monthGridWindow, type CalendarViewer,
} from './calendarModel'

const GLITZ = '11111111-1111-1111-1111-111111111111'
const NPT = '22222222-2222-2222-2222-222222222222'

const alice: CalendarViewer = {
  permissions: {}, brandAccess: {}, teamMemberId: 'm1', email: 'a@x.com',
  team: 'Stores', department: 'Operations', brandIds: [GLITZ],
}
const bob: CalendarViewer = {
  permissions: {}, brandAccess: {}, teamMemberId: 'm2', email: 'b@x.com',
  team: 'Production', department: 'Operations', brandIds: [NPT],
}
const admin: CalendarViewer = {
  permissions: null, brandAccess: null, teamMemberId: 'm9', email: 'admin@x.com',
}

// ─── Event visibility (§6) ──────────────────────────────────────────────────

test('a private event is visible only to its creator', () => {
  const ev = { id: 'e', visibility: 'private', created_by_id: 'm1' }
  assert.equal(canSeeEvent(alice, ev), true)
  assert.equal(canSeeEvent(bob, ev), false)
})

test("a manager grant does NOT unlock someone else's private event", () => {
  // §6: "Do not automatically expose every employee's entire private calendar
  // to every manager." This holds even for the founding admin.
  const ev = { id: 'e', visibility: 'private', created_by_id: 'm1' }
  assert.equal(canSeeEvent(admin, ev), false)
})

test('an attendee always sees the event regardless of visibility band', () => {
  const ev = { id: 'e', visibility: 'private', created_by_id: 'm1', attendee_member_ids: ['m2'] }
  assert.equal(canSeeEvent(bob, ev), true)
})

test('users-visibility matches the named list only', () => {
  const ev = { id: 'e', visibility: 'users', created_by_id: 'm9', visibility_user_ids: ['m1'] }
  assert.equal(canSeeEvent(alice, ev), true)
  assert.equal(canSeeEvent(bob, ev), false)
})

test('team and department visibility match the viewer attribute', () => {
  assert.equal(canSeeEvent(alice, { id: 'e', visibility: 'team', visibility_team: 'Stores', created_by_id: 'm9' }), true)
  assert.equal(canSeeEvent(bob, { id: 'e', visibility: 'team', visibility_team: 'Stores', created_by_id: 'm9' }), false)
  const dept = { id: 'e', visibility: 'department', visibility_department: 'Operations', created_by_id: 'm9' }
  assert.equal(canSeeEvent(alice, dept), true)
  assert.equal(canSeeEvent(bob, dept), true)
})

test('a blank team target matches nobody rather than everybody', () => {
  const ev = { id: 'e', visibility: 'team', visibility_team: '', created_by_id: 'm9' }
  assert.equal(canSeeEvent(alice, ev), false)
})

test('brand visibility is limited to members of that brand', () => {
  const ev = { id: 'e', visibility: 'brand', brand_id: GLITZ, created_by_id: 'm9' }
  assert.equal(canSeeEvent(alice, ev), true)
  assert.equal(canSeeEvent(bob, ev), false)
})

test('company visibility reaches everyone', () => {
  const ev = { id: 'e', visibility: 'company', created_by_id: 'm9' }
  assert.equal(canSeeEvent(alice, ev), true)
  assert.equal(canSeeEvent(bob, ev), true)
})

test('an unknown visibility band is closed, not open', () => {
  assert.equal(canSeeEvent(alice, { id: 'e', visibility: 'everyone_lol', created_by_id: 'm9' }), false)
})

// ─── People scope (§6 managerial calendar) ──────────────────────────────────

test('an ordinary employee sees only their own schedule', () => {
  assert.deepEqual(calendarPeopleScope(alice), { kind: 'own' })
})

test('a brand-scoped manager gets a brand-scoped team calendar', () => {
  const mgr: CalendarViewer = { ...alice, permissions: { calendar_team: 'view' }, brandAccess: { calendar_team: [GLITZ] } }
  assert.deepEqual(calendarPeopleScope(mgr), { kind: 'brands', brandIds: [GLITZ] })
})

test('task oversight implies the calendar rendering of the same tasks', () => {
  const mgr: CalendarViewer = { ...alice, permissions: { all_tasks: 'view' }, brandAccess: { all_tasks: [NPT] } }
  assert.deepEqual(calendarPeopleScope(mgr), { kind: 'brands', brandIds: [NPT] })
})

test('the founding admin sees all schedules', () => {
  assert.deepEqual(calendarPeopleScope(admin), { kind: 'all' })
})

// ─── Event creation (§6 company calendar) ───────────────────────────────────

test('anyone may create a private or invitee-only event', () => {
  assert.equal(canCreateEvent(alice, 'private', null), true)
  assert.equal(canCreateEvent(alice, 'users', null), true)
})

test('an ordinary employee cannot create a company-wide event', () => {
  assert.equal(canCreateEvent(alice, 'company', null), false)
  assert.equal(canCreateEvent(alice, 'brand', GLITZ), false)
})

test('a brand-scoped organiser can announce to their brand but not the company', () => {
  const organiser: CalendarViewer = {
    ...alice, permissions: { calendar_events: 'edit' }, brandAccess: { calendar_events: [GLITZ] },
  }
  assert.equal(canCreateEvent(organiser, 'brand', GLITZ), true)
  assert.equal(canCreateEvent(organiser, 'brand', NPT), false)
  assert.equal(canCreateEvent(organiser, 'company', null), false)
})

test('an unscoped organiser can announce company-wide', () => {
  const organiser: CalendarViewer = { ...alice, permissions: { calendar_events: 'edit' }, brandAccess: {} }
  assert.equal(canCreateEvent(organiser, 'company', null), true)
})

// ─── Reschedule authority (§7) ──────────────────────────────────────────────

test('an assignee may NOT drag a manager-assigned task to a new date', () => {
  // The exact case §7 calls out.
  assert.equal(canReschedule(alice, { type: 'task', createdById: 'm9', assigneeId: 'm1' }), false)
})

test('a task-oversight manager may reschedule a task', () => {
  const mgr: CalendarViewer = { ...alice, permissions: { all_tasks: 'edit' } }
  assert.equal(canReschedule(mgr, { type: 'task', createdById: 'm9', assigneeId: 'm1' }), true)
})

test('anyone may move their own personal task or their own event', () => {
  assert.equal(canReschedule(alice, { type: 'personal_task', assigneeId: 'm1' }), true)
  assert.equal(canReschedule(alice, { type: 'personal_task', assigneeId: 'm2' }), false)
  assert.equal(canReschedule(alice, { type: 'event', createdById: 'm1' }), true)
})

test('moving a duty occurrence needs duty-edit rights', () => {
  assert.equal(canReschedule(alice, { type: 'duty', createdById: 'm9' }), false)
  const mgr: CalendarViewer = { ...alice, permissions: { duties: 'edit' } }
  assert.equal(canReschedule(mgr, { type: 'duty', createdById: 'm9' }), true)
})

// ─── View windows (§5) ──────────────────────────────────────────────────────

test('day view is a single day', () => {
  assert.deepEqual(viewWindow('day', '2026-08-05'), { from: '2026-08-05', to: '2026-08-05' })
})

test('week view runs Monday to Sunday', () => {
  // 2026-08-05 is a Wednesday.
  assert.deepEqual(viewWindow('week', '2026-08-05'), { from: '2026-08-03', to: '2026-08-09' })
})

test('a Sunday belongs to the week that started the previous Monday', () => {
  assert.deepEqual(viewWindow('week', '2026-08-09'), { from: '2026-08-03', to: '2026-08-09' })
})

test('a Monday is the first day of its own week', () => {
  assert.deepEqual(viewWindow('week', '2026-08-03'), { from: '2026-08-03', to: '2026-08-09' })
})

test('month view spans the calendar month', () => {
  assert.deepEqual(viewWindow('month', '2026-08-05'), { from: '2026-08-01', to: '2026-08-31' })
})

test('month view handles February in a non-leap year', () => {
  assert.deepEqual(viewWindow('month', '2026-02-10'), { from: '2026-02-01', to: '2026-02-28' })
})

test('the month grid pads out to whole Monday-first weeks', () => {
  // Aug 2026 starts Sat 1st and ends Mon 31st.
  assert.deepEqual(monthGridWindow('2026-08-05'), { from: '2026-07-27', to: '2026-09-06' })
})

test('agenda view is a rolling 30 days from the anchor', () => {
  assert.deepEqual(viewWindow('agenda', '2026-08-05'), { from: '2026-08-05', to: '2026-09-03' })
})

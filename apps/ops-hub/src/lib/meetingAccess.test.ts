import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canAccessMeeting, canEditMeetingNotes, type MeetingActorLike } from './meetingAccess'
import type { OcgMeetingRow } from '@ocg/db'

function meeting(over: Partial<OcgMeetingRow> = {}): OcgMeetingRow {
  return {
    id: 'm1',
    brand_id: 'brand-A',
    created_by: 'Alice',
    attendees: ['Bob'],
    attendee_emails: ['bob@ocg.com'],
    // fields the access logic never reads — cast keeps the test focused.
    ...over,
  } as OcgMeetingRow
}

function actor(opts: {
  email?: string | null
  name?: string
  viewAll?: boolean
  editAll?: boolean
  brandIds?: string[] | null
}): MeetingActorLike {
  return {
    email: opts.email ?? null,
    name: opts.name ?? '',
    can: (section, level = 'view') => {
      if (section !== 'meetings') return false
      if (level === 'edit') return !!opts.editAll
      return !!opts.viewAll || !!opts.editAll
    },
    allowedBrandIds: (section) => (section === 'meetings' ? (opts.brandIds ?? null) : null),
  }
}

test('a listed attendee (by email) can access the meeting', () => {
  assert.equal(canAccessMeeting(actor({ email: 'bob@ocg.com', name: 'Bob' }), meeting()), true)
})

test('an attendee matched by display name can access the meeting', () => {
  assert.equal(canAccessMeeting(actor({ email: 'other@ocg.com', name: 'Bob' }), meeting()), true)
})

test('the creator can access the meeting', () => {
  assert.equal(canAccessMeeting(actor({ email: 'alice@ocg.com', name: 'Alice' }), meeting()), true)
})

test('a non-participant with NO meetings grant is denied (the leak that is fixed)', () => {
  assert.equal(canAccessMeeting(actor({ email: 'stranger@ocg.com', name: 'Stranger' }), meeting()), false)
})

test('an unrestricted "view all meetings" grant sees any meeting', () => {
  assert.equal(canAccessMeeting(actor({ email: 'boss@ocg.com', name: 'Boss', viewAll: true }), meeting()), true)
})

test('a brand-scoped viewer sees meetings in their brand only', () => {
  const viewer = actor({ email: 'mgr@ocg.com', name: 'Mgr', viewAll: true, brandIds: ['brand-A'] })
  assert.equal(canAccessMeeting(viewer, meeting({ brand_id: 'brand-A' })), true)
  assert.equal(canAccessMeeting(viewer, meeting({ brand_id: 'brand-B' })), false)
})

test('a brand-scoped viewer still sees a foreign-brand meeting they attend', () => {
  const viewer = actor({ email: 'bob@ocg.com', name: 'Bob', viewAll: true, brandIds: ['brand-B'] })
  assert.equal(canAccessMeeting(viewer, meeting({ brand_id: 'brand-A' })), true) // participant
})

test('note editing: participant yes, manage-all yes, stranger no', () => {
  assert.equal(canEditMeetingNotes(actor({ name: 'Bob' }), meeting()), true)
  assert.equal(canEditMeetingNotes(actor({ name: 'Zed', editAll: true }), meeting()), true)
  assert.equal(canEditMeetingNotes(actor({ name: 'Zed' }), meeting()), false)
})

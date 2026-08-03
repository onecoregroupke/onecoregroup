import type { OcgMeetingRow, SectionKey, AccessLevel } from '@ocg/db'

// Pure meeting-access rules, deliberately free of any DB/server-auth import so
// they can be unit-tested (see meetingAccess.test.ts) and reused by pages, API
// routes, and the DOCX export without pulling the whole meetings service in.

/** Structural subset of Actor needed to decide meeting access. */
export interface MeetingActorLike {
  email: string | null
  name: string
  can: (section: SectionKey, level?: AccessLevel) => boolean
  allowedBrandIds: (section: SectionKey) => string[] | null
}

export function cleanEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function cleanEmailList(emails: string[]): string[] {
  return [...new Set(emails.map(cleanEmail).filter(Boolean))]
}

/**
 * Can this actor SEE this meeting?
 *
 * Default is PARTICIPANT-SCOPED: the creator or a listed attendee (matched by
 * email or by display name). The `meetings` grant is a separate "view every
 * meeting" capability that may be restricted to specific brands via
 * `brand_access.meetings`. There is deliberately NO management/ops inheritance —
 * a manager does not automatically see meetings they are not part of. The
 * founding admin (permissions === null) passes because `can()` returns true.
 */
export function canAccessMeeting(actor: MeetingActorLike, meeting: OcgMeetingRow): boolean {
  if (actor.can('meetings', 'view')) {
    const brandIds = actor.allowedBrandIds('meetings')
    if (brandIds === null) return true // unrestricted "view all meetings"
    if (meeting.brand_id && brandIds.includes(meeting.brand_id)) return true
    // brand-scoped viewers still see meetings they personally take part in ↓
  }
  const email = cleanEmail(actor.email ?? '')
  const name = actor.name.trim().toLowerCase()
  const creator = meeting.created_by.trim().toLowerCase()
  return (
    (!!email && meeting.attendee_emails.map(cleanEmail).includes(email)) ||
    (!!name && meeting.attendees.map((a) => a.trim().toLowerCase()).includes(name)) ||
    (!!name && creator === name) ||
    (!!email && creator === email)
  )
}

/** Can this actor EDIT this meeting's notes? Any participant (see above) plus
 *  anyone holding the manage-all grant (`meetings` edit). */
export function canEditMeetingNotes(actor: MeetingActorLike, meeting: OcgMeetingRow): boolean {
  return actor.can('meetings', 'edit') || canAccessMeeting(actor, meeting)
}

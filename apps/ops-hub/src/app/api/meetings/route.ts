import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import {
  createMeeting, updateMeeting, updateMeetingNotes, addActionItem, updateActionItem,
  actionItemToTask, generatePrepBrief, getMeeting, canAccessMeeting, canEditMeetingNotes,
  updateMeetingAttendees,
} from '@/lib/meetings'

/**
 * Meetings endpoint (all writes require `meetings` edit — which management/ops
 * grants inherit):
 *   POST { action: 'create_meeting' | 'update_meeting' | 'add_action' |
 *          'update_action' | 'to_task' | 'generate_prep', id?, values? }
 */
export async function POST(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const action = body?.action as string
    const id = body?.id as string | undefined
    const values = (body?.values ?? {}) as Record<string, unknown>

    switch (action) {
      case 'create_meeting': {
        const meeting = await createMeeting({
          title: String(values.title ?? ''),
          meeting_date: String(values.meeting_date ?? ''),
          brand_id: (values.brand_id as string) || null,
          project_id: (values.project_id as string) || null,
          location: (values.location as string) ?? '',
          agenda: (values.agenda as string) ?? '',
          attendees: Array.isArray(values.attendees)
            ? (values.attendees as string[])
            : String(values.attendees ?? '').split(',').map((s) => s.trim()).filter(Boolean),
          attendee_emails: Array.isArray(values.attendee_emails)
            ? (values.attendee_emails as string[])
            : String(values.attendee_emails ?? '').split(',').map((s) => s.trim()).filter(Boolean),
          attendee_member_ids: Array.isArray(values.attendee_member_ids)
            ? (values.attendee_member_ids as string[])
            : String(values.attendee_member_ids ?? '').split(',').map((s) => s.trim()).filter(Boolean),
          meeting_mode: (values.meeting_mode as string) || 'in_person',
          meeting_url: (values.meeting_url as string) || '',
          series_key: (values.series_key as string) || undefined,
          created_by: actor.name || actor.email || 'unknown',
          created_by_email: actor.email,
          save_as_template: values.save_as_template === true,
        })
        return NextResponse.json({ ok: true, meeting }, { status: 201 })
      }
      case 'update_attendees': {
        if (!id) throw new Error('id is required')
        const existing = await getMeeting(id)
        if (!existing) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
        if (!actor.can('meetings', 'edit') && !canAccessMeeting(actor, existing)) {
          return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
        }
        const meeting = await updateMeetingAttendees(id, {
          attendees: Array.isArray(values.attendees)
            ? (values.attendees as string[])
            : String(values.attendees ?? '').split(',').map((s) => s.trim()).filter(Boolean),
          attendee_emails: Array.isArray(values.attendee_emails)
            ? (values.attendee_emails as string[])
            : String(values.attendee_emails ?? '').split(',').map((s) => s.trim()).filter(Boolean),
          attendee_member_ids: Array.isArray(values.attendee_member_ids)
            ? (values.attendee_member_ids as string[])
            : String(values.attendee_member_ids ?? '').split(',').map((s) => s.trim()).filter(Boolean),
          actorName: actor.name || actor.email || 'unknown',
          actorEmail: actor.email ?? '',
        })
        return NextResponse.json({ ok: true, meeting })
      }
      case 'update_meeting': {
        if (!id) throw new Error('id is required')
        const existing = await getMeeting(id)
        if (!existing) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
        const keys = Object.keys(values)
        const notesOnly = keys.every((k) => k === 'notes' || k === 'summary')
        if (notesOnly) {
          if (!canEditMeetingNotes(actor, existing)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
          const meeting = await updateMeetingNotes(id, {
            notes: values.notes as string | undefined,
            summary: values.summary as string | undefined,
          }, actor.name || actor.email || 'unknown')
          return NextResponse.json({ ok: true, meeting })
        }
        if (!actor.can('meetings', 'edit')) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
        if (Array.isArray(values.attendees) === false && values.attendees !== undefined) {
          values.attendees = String(values.attendees).split(',').map((s) => s.trim()).filter(Boolean)
        }
        const meeting = await updateMeeting(id, values)
        return NextResponse.json({ ok: true, meeting })
      }
      case 'add_action': {
        const meetingId = String(values.meeting_id ?? '')
        const existing = await getMeeting(meetingId)
        if (!existing) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
        if (!canAccessMeeting(actor, existing)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
        const item = await addActionItem({
          meeting_id: meetingId,
          description: String(values.description ?? ''),
          owner: (values.owner as string) ?? '',
          due_date: (values.due_date as string) || null,
          notes: (values.notes as string) ?? '',
        })
        return NextResponse.json({ ok: true, item }, { status: 201 })
      }
      case 'update_action': {
        if (!id) throw new Error('id is required')
        if (!actor.can('meetings', 'edit')) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
        const item = await updateActionItem(id, values)
        return NextResponse.json({ ok: true, item })
      }
      case 'to_task': {
        if (!id) throw new Error('id is required')
        if (!actor.can('meetings', 'edit') && !actor.can('ops', 'edit')) {
          return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
        }
        const task = await actionItemToTask(id, actor.name || actor.email || 'unknown')
        return NextResponse.json({ ok: true, task }, { status: 201 })
      }
      case 'generate_prep': {
        if (!id) throw new Error('id is required')
        const existing = await getMeeting(id)
        if (!existing) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
        if (!canAccessMeeting(actor, existing)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
        const meeting = await generatePrepBrief(id)
        return NextResponse.json({ ok: true, meeting })
      }
      default:
        return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

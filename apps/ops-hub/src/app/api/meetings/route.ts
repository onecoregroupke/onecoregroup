import { NextResponse, type NextRequest } from 'next/server'
import { requireApiSection } from '@/lib/api-auth'
import {
  createMeeting, updateMeeting, addActionItem, updateActionItem,
  actionItemToTask, generatePrepBrief,
} from '@/lib/meetings'

/**
 * Meetings endpoint (all writes require `meetings` edit — which management/ops
 * grants inherit):
 *   POST { action: 'create_meeting' | 'update_meeting' | 'add_action' |
 *          'update_action' | 'to_task' | 'generate_prep', id?, values? }
 */
export async function POST(req: NextRequest) {
  const gate = await requireApiSection(req, 'meetings', 'edit')
  if (gate instanceof NextResponse) return gate
  const actor = gate

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
          series_key: (values.series_key as string) || undefined,
          created_by: actor.name || actor.email || 'unknown',
        })
        return NextResponse.json({ ok: true, meeting }, { status: 201 })
      }
      case 'update_meeting': {
        if (!id) throw new Error('id is required')
        if (Array.isArray(values.attendees) === false && values.attendees !== undefined) {
          values.attendees = String(values.attendees).split(',').map((s) => s.trim()).filter(Boolean)
        }
        const meeting = await updateMeeting(id, values)
        return NextResponse.json({ ok: true, meeting })
      }
      case 'add_action': {
        const item = await addActionItem({
          meeting_id: String(values.meeting_id ?? ''),
          description: String(values.description ?? ''),
          owner: (values.owner as string) ?? '',
          due_date: (values.due_date as string) || null,
          notes: (values.notes as string) ?? '',
        })
        return NextResponse.json({ ok: true, item }, { status: 201 })
      }
      case 'update_action': {
        if (!id) throw new Error('id is required')
        const item = await updateActionItem(id, values)
        return NextResponse.json({ ok: true, item })
      }
      case 'to_task': {
        if (!id) throw new Error('id is required')
        const task = await actionItemToTask(id, actor.name || actor.email || 'unknown')
        return NextResponse.json({ ok: true, task }, { status: 201 })
      }
      case 'generate_prep': {
        if (!id) throw new Error('id is required')
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

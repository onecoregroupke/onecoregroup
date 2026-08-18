import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { memberForEmail, listTeam } from '@/lib/team'
import { calendarFeed, recordReschedule } from '@/lib/calendarFeed'
import { resolveScopeMembers, type CalendarScope } from '@/lib/calendarScope'
import { canCreateEvent, CALENDAR_VIEWS, CALENDAR_EVENT_KINDS, type CalendarView, type CalendarItemType } from '@/lib/calendarModel'
import { auditEvent } from '@/lib/audit'
import { db, nowIso } from '@/lib/serverClient'
import type { OcgCalendarEventRow } from '@ocg/db'

/** Build the viewer context every calendar call needs. */
async function viewerFor(actor: NonNullable<Awaited<ReturnType<typeof getApiActor>>>) {
  const me = await memberForEmail(actor.email)
  return {
    permissions: actor.permissions,
    brandAccess: actor.brandAccess,
    teamMemberId: me?.id ?? null,
    email: actor.email,
    team: (me as { team?: string } | null)?.team ?? '',
    department: me?.department ?? '',
    brandIds: me?.brand_ids ?? [],
  }
}

/**
 * The unified calendar feed. Every item type is permission-filtered at its own
 * source inside calendarFeed(), so a new source cannot forget the filter.
 */
export async function GET(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const viewParam = url.searchParams.get('view') ?? 'week'
  const view = (CALENDAR_VIEWS as readonly string[]).includes(viewParam) ? (viewParam as CalendarView) : 'week'
  const types = url.searchParams.get('types')?.split(',').filter(Boolean) as CalendarItemType[] | undefined
  const brandIds = url.searchParams.get('brands')?.split(',').filter(Boolean)

  const viewer = await viewerFor(actor)
  // The people filter is resolved SERVER-side from a named scope, so a client
  // can never enumerate the roster by probing member ids. calendarFeed() then
  // intersects this with the viewer's permission scope — a scope can only ever
  // narrow what permissions already allow.
  const scope = (url.searchParams.get('scope') ?? 'personal') as CalendarScope
  const memberIds = await resolveScopeMembers(scope, viewer, await listTeam())

  try {
    const feed = await calendarFeed(viewer, {
      view,
      date: url.searchParams.get('date') ?? undefined,
      from: url.searchParams.get('from') ?? undefined,
      to: url.searchParams.get('to') ?? undefined,
      types,
      brandIds,
      memberIds,
    })
    return NextResponse.json({ ok: true, ...feed })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

/** Create a calendar event. Company/brand events need the calendar_events grant;
 *  private and named-invitee events are open to any signed-in user. */
export async function POST(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const viewer = await viewerFor(actor)

  try {
    const body = await req.json()
    const title = String(body?.title ?? '').trim()
    if (!title) return NextResponse.json({ ok: false, error: 'A title is required.' }, { status: 400 })
    if (!body?.starts_at) return NextResponse.json({ ok: false, error: 'A start time is required.' }, { status: 400 })

    const visibility = String(body.visibility ?? 'private')
    const brandId = (body.brand_id as string) || null
    if (!canCreateEvent(viewer, visibility, brandId)) {
      return NextResponse.json(
        { ok: false, error: 'You do not have permission to create an event with that visibility.' },
        { status: 403 },
      )
    }

    const kind = String(body.event_kind ?? 'event')
    const { data, error } = await db().from('ocg_calendar_events').insert({
      title,
      description: String(body.description ?? ''),
      event_kind: (CALENDAR_EVENT_KINDS as readonly string[]).includes(kind) ? kind : 'event',
      brand_id: brandId,
      starts_at: body.starts_at,
      ends_at: body.ends_at || null,
      all_day: body.all_day === true,
      timezone: String(body.timezone || 'Africa/Nairobi'),
      location: String(body.location ?? ''),
      visibility,
      visibility_team: String(body.visibility_team ?? ''),
      visibility_department: String(body.visibility_department ?? ''),
      visibility_user_ids: Array.isArray(body.visibility_user_ids) ? body.visibility_user_ids : [],
      created_by_id: viewer.teamMemberId,
      created_by: actor.name || actor.email || actor.userId,
      status: String(body.status ?? 'confirmed'),
      notes: String(body.notes ?? ''),
    }).select('*').single()
    if (error) throw new Error(error.message)
    const row = data as OcgCalendarEventRow

    const attendees: string[] = Array.isArray(body.attendee_ids) ? body.attendee_ids : []
    if (attendees.length > 0) {
      await db().from('ocg_calendar_event_attendees').insert(
        attendees.map((id) => ({ event_id: row.id, team_member_id: id })),
      )
    }

    await auditEvent({
      actor,
      action: 'calendar.event.create',
      entity_table: 'ocg_calendar_events',
      entity_id: row.id,
      entity_label: row.title,
      after_data: row as unknown as Record<string, unknown>,
    })

    return NextResponse.json({ ok: true, row }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

/**
 * Reschedule an event (§7). Every move is written to ocg_calendar_reschedules —
 * the audit the brief requires — and only the creator or a calendar_events
 * editor may move one.
 */
export async function PATCH(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const viewer = await viewerFor(actor)

  try {
    const body = await req.json()
    if (!body?.id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })

    const { data: existing } = await db().from('ocg_calendar_events').select('*').eq('id', body.id).maybeSingle()
    if (!existing) return NextResponse.json({ ok: false, error: 'Event not found' }, { status: 404 })
    const before = existing as OcgCalendarEventRow

    const isCreator = !!viewer.teamMemberId && before.created_by_id === viewer.teamMemberId
    if (!isCreator && !canCreateEvent(viewer, before.visibility, before.brand_id)) {
      return NextResponse.json({ ok: false, error: 'You may not change this event.' }, { status: 403 })
    }

    const patch: Record<string, unknown> = { updated_at: nowIso() }
    for (const key of ['title', 'description', 'location', 'notes', 'status', 'event_kind', 'all_day'] as const) {
      if (body[key] !== undefined) patch[key] = body[key]
    }
    if (body.starts_at !== undefined) patch['starts_at'] = body.starts_at
    if (body.ends_at !== undefined) patch['ends_at'] = body.ends_at || null

    const { data, error } = await db().from('ocg_calendar_events')
      .update(patch).eq('id', body.id).select('*').single()
    if (error) throw new Error(error.message)
    const row = data as OcgCalendarEventRow

    const moved = row.starts_at !== before.starts_at || row.ends_at !== before.ends_at
    if (moved) {
      await recordReschedule({
        entity_type: 'calendar_event',
        entity_id: row.id,
        previous_date: before.starts_at.slice(0, 10),
        new_date: row.starts_at.slice(0, 10),
        previous_start: before.starts_at,
        new_start: row.starts_at,
        previous_end: before.ends_at,
        new_end: row.ends_at,
        reason: String(body.reason ?? ''),
        moved_by: actor.name || actor.email || actor.userId,
        moved_by_id: viewer.teamMemberId,
        source: String(body.source ?? 'calendar_edit'),
      })
    }

    await auditEvent({
      actor,
      action: moved ? 'calendar.event.reschedule' : 'calendar.event.update',
      entity_table: 'ocg_calendar_events',
      entity_id: row.id,
      entity_label: row.title,
      before_data: before as unknown as Record<string, unknown>,
      after_data: row as unknown as Record<string, unknown>,
    })

    return NextResponse.json({ ok: true, row })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { memberForEmail } from '@/lib/team'
import { listChecklistItems, setChecklistItems } from '@/lib/dutyOccurrences'
import { dutyCan } from '@/lib/dutyModel'

/** Checklist items for a duty template. Any signed-in user may read them —
 *  they need to see what they are being asked to tick. */
export async function GET(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const dutyId = new URL(req.url).searchParams.get('duty_id')
  if (!dutyId) return NextResponse.json({ ok: false, error: 'duty_id is required' }, { status: 400 })
  return NextResponse.json({ ok: true, items: await listChecklistItems(dutyId) })
}

/**
 * Replace a duty's checklist definition. Items dropped from the list are
 * DEACTIVATED, never deleted — past occurrences still reference their results.
 */
export async function PUT(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const me = await memberForEmail(actor.email)
  if (!dutyCan({ permissions: actor.permissions, brandAccess: actor.brandAccess, teamMemberId: me?.id ?? null }, 'edit')) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    if (!body?.duty_id) return NextResponse.json({ ok: false, error: 'duty_id is required' }, { status: 400 })
    const items = Array.isArray(body.items) ? body.items : []
    const cleaned = items
      .map((i: { id?: string; label?: string; hint?: string; required?: boolean }) => ({
        id: i.id,
        label: String(i.label ?? '').trim(),
        hint: String(i.hint ?? '').trim(),
        required: i.required !== false,
      }))
      .filter((i: { label: string }) => i.label.length > 0)

    return NextResponse.json({ ok: true, items: await setChecklistItems(body.duty_id, cleaned) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

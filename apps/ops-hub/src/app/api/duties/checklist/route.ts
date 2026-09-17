import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { memberForEmail } from '@/lib/team'
import { dutyTargetIds, listChecklistItems, setChecklistItems } from '@/lib/dutyOccurrences'
import { canAssignDutyInBrand, canViewDutyDefinition, dutyCan } from '@/lib/dutyModel'
import { db } from '@/lib/serverClient'
import type { OcgDailyDutyRow } from '@ocg/db'

/**
 * Checklist items for a duty definition. The person the duty targets may read
 * them — they need to see what they are being asked to do — as may anyone whose
 * duty grant covers the duty's brand. Nobody else: a duty id is not a key to
 * another employee's responsibilities, and an unknown or forbidden id answers
 * with the same 404.
 */
export async function GET(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const dutyId = new URL(req.url).searchParams.get('duty_id')
  if (!dutyId) return NextResponse.json({ ok: false, error: 'duty_id is required' }, { status: 400 })

  const { data } = await db().from('ocg_daily_duties').select('*').eq('id', dutyId).maybeSingle()
  const duty = (data as OcgDailyDutyRow | null) ?? null
  const allowed = !!duty && canViewDutyDefinition(
    { permissions: actor.permissions, brandAccess: actor.brandAccess, teamMemberId: actor.teamMemberId },
    { targetedIds: await dutyTargetIds(duty), dutyBrandId: duty.brand_id },
  )
  if (!allowed) return NextResponse.json({ ok: false, error: 'Duty not found' }, { status: 404 })
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
    // Same brand rule as editing the rest of the definition (PATCH /api/duties).
    const { data: duty } = await db().from('ocg_daily_duties').select('brand_id').eq('id', String(body.duty_id)).maybeSingle()
    if (!duty) return NextResponse.json({ ok: false, error: 'Duty not found' }, { status: 404 })
    if (!canAssignDutyInBrand(
      { permissions: actor.permissions, brandAccess: actor.brandAccess, teamMemberId: me?.id ?? null },
      (duty as { brand_id: string | null }).brand_id,
    )) {
      return NextResponse.json({ ok: false, error: 'This duty is outside the brands you manage.' }, { status: 403 })
    }
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

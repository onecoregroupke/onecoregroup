import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { insertManagedRow, recordRayyanFeePayment, updateManagedRow, sectionForMutationType, type MutationType } from '@/lib/managementMutations'

export async function POST(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const type = body?.type as MutationType
    if (!actor.can(sectionForMutationType(type), 'edit')) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }
    const row = type === 'rayyan_fee_payment'
      ? await recordRayyanFeePayment(body?.values ?? {})
      : await insertManagedRow(type, body?.values ?? {})
    return NextResponse.json({ ok: true, row }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

export async function PATCH(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const type = body?.type as MutationType
    if (!actor.can(sectionForMutationType(type), 'edit')) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }
    const row = await updateManagedRow(type, body?.id, body?.values ?? {})
    return NextResponse.json({ ok: true, row })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

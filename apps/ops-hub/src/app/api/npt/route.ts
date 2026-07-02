import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import {
  completeNptJob,
  insertManagedRow,
  updateManagedRow,
  sectionForMutationType,
  type MutationType,
} from '@/lib/managementMutations'
import { completeAppointment } from '@/lib/npt'

export async function POST(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const type = body?.type as MutationType
    if (!actor.can(sectionForMutationType(type), 'edit')) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }
    const row = await insertManagedRow(type, body?.values ?? {})
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
    // Special completion actions carry no `type` — they're always NPT service.
    const section = body?.action === 'complete-job' || body?.action === 'complete-appointment'
      ? 'npt_service' as const
      : sectionForMutationType(body?.type as MutationType)
    if (!actor.can(section, 'edit')) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }
    let row
    if (body?.action === 'complete-job') row = await completeNptJob(body?.id, body?.values ?? {})
    else if (body?.action === 'complete-appointment') row = await completeAppointment(body?.id, body?.values ?? {})
    else row = await updateManagedRow(body?.type as MutationType, body?.id, body?.values ?? {})
    return NextResponse.json({ ok: true, row })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { insertManagedRow, recordRhythmsFeePayment, updateManagedRow, type MutationType } from '@/lib/managementMutations'

export async function POST(req: NextRequest) {
  if (!(await requireUser(req))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const row = body?.type === 'rhythms_fee_payment'
      ? await recordRhythmsFeePayment(body?.values ?? {})
      : await insertManagedRow(body?.type as MutationType, body?.values ?? {})
    return NextResponse.json({ ok: true, row }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await requireUser(req))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const row = await updateManagedRow(body?.type as MutationType, body?.id, body?.values ?? {})
    return NextResponse.json({ ok: true, row })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

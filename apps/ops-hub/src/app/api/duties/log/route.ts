import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { setDutyLog } from '@/lib/duties'

// Any signed-in user (incl. portal team members) can mark their own duty done/skipped.
export async function POST(req: NextRequest) {
  if (!(await requireUser(req))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    if (!body?.duty_id) return NextResponse.json({ ok: false, error: 'duty_id is required' }, { status: 400 })
    const row = await setDutyLog({
      duty_id: body.duty_id,
      status: body?.status ?? 'done',
      note: body?.note ?? '',
      date: body?.date,
    })
    return NextResponse.json({ ok: true, row })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

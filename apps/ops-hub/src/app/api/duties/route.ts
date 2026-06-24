import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { createDuty, updateDuty } from '@/lib/duties'

export async function POST(req: NextRequest) {
  if (!(await requireUser(req))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const row = await createDuty({
      assignee_id: body?.assignee_id ?? null,
      brand_id: body?.brand_id ?? null,
      title: body?.title ?? '',
      description: body?.description ?? '',
      department: body?.department ?? 'Operations',
      sort_order: typeof body?.sort_order === 'number' ? body.sort_order : 0,
    })
    return NextResponse.json({ ok: true, row }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await requireUser(req))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    if (!body?.id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })
    const { id, ...fields } = body
    const row = await updateDuty(id, fields)
    return NextResponse.json({ ok: true, row })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

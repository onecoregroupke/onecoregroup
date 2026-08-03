import { NextResponse, type NextRequest } from 'next/server'
import { requireApiSection } from '@/lib/api-auth'
import { createDuty, updateDuty } from '@/lib/duties'

export async function POST(req: NextRequest) {
  const gate = await requireApiSection(req, 'management', 'edit')
  if (gate instanceof NextResponse) return gate
  try {
    const body = await req.json()
    const row = await createDuty({
      assignee_id: body?.assignee_id ?? null,
      brand_id: body?.brand_id ?? null,
      title: body?.title ?? '',
      description: body?.description ?? '',
      department: body?.department ?? 'Operations',
      sort_order: typeof body?.sort_order === 'number' ? body.sort_order : 0,
      frequency: body?.frequency ?? 'daily',
      weekdays: Array.isArray(body?.weekdays) ? body.weekdays.map(Number) : [],
      day_of_month: body?.day_of_month === '' || body?.day_of_month == null ? null : Number(body.day_of_month),
      interval_days: body?.interval_days ? Number(body.interval_days) : 0,
      time_of_day: body?.time_of_day ?? '',
      timezone: body?.timezone || 'Africa/Nairobi',
      start_date: body?.start_date || null,
      end_date: body?.end_date || null,
      priority: body?.priority ?? 'Medium',
      category: body?.category ?? '',
      requires_proof: body?.requires_proof === true,
      reminder_minutes: body?.reminder_minutes ? Number(body.reminder_minutes) : 0,
    })
    return NextResponse.json({ ok: true, row }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireApiSection(req, 'management', 'edit')
  if (gate instanceof NextResponse) return gate
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

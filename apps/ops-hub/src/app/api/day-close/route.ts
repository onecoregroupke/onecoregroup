import { NextResponse, type NextRequest } from 'next/server'
import { requireApiSection } from '@/lib/api-auth'
import { closeDay, getDayCloseStatus } from '@/lib/dayClose'

/**
 * Day close — the admin's end-of-day verification. Requires `management` edit
 * (founding admin always passes).
 *   GET  → today's checks + whether the day is already closed
 *   POST { notes? } → close the day and send the master report
 */
export async function GET(req: NextRequest) {
  const gate = await requireApiSection(req, 'management', 'edit')
  if (gate instanceof NextResponse) return gate
  try {
    const status = await getDayCloseStatus()
    return NextResponse.json({ ok: true, status })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireApiSection(req, 'management', 'edit')
  if (gate instanceof NextResponse) return gate
  const actor = gate
  try {
    const body = await req.json().catch(() => ({}))
    const result = await closeDay({
      closedBy: actor.name || actor.email || 'admin',
      notes: (body?.notes as string) ?? '',
    })
    return NextResponse.json({ ok: true, ...result }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

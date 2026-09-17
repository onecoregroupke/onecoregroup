import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { completeDutyOccurrence, dutyTargetIds, DutyCompletionError } from '@/lib/dutyOccurrences'
import { canWorkDutyOccurrence } from '@/lib/dutyModel'
import { db } from '@/lib/serverClient'
import type { OcgDailyDutyRow } from '@ocg/db'

/**
 * Backwards-compatible completion endpoint for the simple "tick it off" widgets
 * (MyDuties on the dashboard). It delegates to the SAME service as
 * /api/duties/complete so there is exactly one completion path with one set of
 * requirement checks — a duty needing a note or a checklist is refused here too.
 *
 * It also now keys the occurrence on (duty, date, assignee), matching migration
 * 055. The previous implementation keyed on (duty, date) alone, which could
 * write a second log row for a group-targeted duty. Like /complete, it only
 * records the caller's own occurrence of a duty that targets them.
 */
export async function POST(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    if (!body?.duty_id) return NextResponse.json({ ok: false, error: 'duty_id is required' }, { status: 400 })
    const me = actor.teamMemberId

    const { data: dutyRow } = await db().from('ocg_daily_duties').select('*').eq('id', String(body.duty_id)).maybeSingle()
    const duty = (dutyRow as OcgDailyDutyRow | null) ?? null
    if (!duty) return NextResponse.json({ ok: false, error: 'Duty not found' }, { status: 404 })
    const access = canWorkDutyOccurrence(
      { permissions: actor.permissions, brandAccess: actor.brandAccess, teamMemberId: me },
      { targetedIds: await dutyTargetIds(duty), dutyBrandId: duty.brand_id, assigneeId: me },
    )
    if (!me || !access.allowed || access.onBehalf) {
      return NextResponse.json({ ok: false, error: 'You may only complete duties assigned to you.' }, { status: 403 })
    }

    const row = await completeDutyOccurrence({
      duty_id: duty.id,
      assignee_id: me,
      date: body.date,
      status: body?.status ?? 'done',
      note: body?.note ?? '',
      completed_by: actor.name || actor.email || actor.userId,
    })
    return NextResponse.json({ ok: true, row })
  } catch (e) {
    if (e instanceof DutyCompletionError) {
      return NextResponse.json({ ok: false, error: e.message, problems: e.problems }, { status: 422 })
    }
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

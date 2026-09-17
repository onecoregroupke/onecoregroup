import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { occurrenceFor } from '@/lib/dutyOccurrences'
import { toOccurrenceDtos } from '@/lib/dutyView'
import { canViewDutyOccurrence, canWorkDutyOccurrence } from '@/lib/dutyModel'
import { calendarPeopleScope } from '@/lib/calendarModel'
import { todayInEat } from '@/lib/serverClient'

/**
 * One duty occurrence in full — the definition's checklist with its hints, plus
 * that date's ticks, note and review — for the Calendar's duty detail.
 *
 *   ?duty_id=…&date=YYYY-MM-DD[&assignee_id=…]
 *
 * `assignee_id` defaults to the caller. Asking for someone else's occurrence
 * only succeeds for a viewer whose duty or team-calendar grant already covers
 * that person; otherwise the answer is the same 404 as for a duty that does not
 * exist, so ids cannot be probed.
 */
export async function GET(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const dutyId = url.searchParams.get('duty_id') ?? ''
  const date = url.searchParams.get('date') || todayInEat()
  if (!dutyId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, error: 'duty_id and a YYYY-MM-DD date are required' }, { status: 400 })
  }

  const me = actor.teamMemberId
  const assigneeParam = url.searchParams.get('assignee_id')
  const assigneeId = assigneeParam === null ? me : (assigneeParam || null)
  const notFound = NextResponse.json({ ok: false, error: 'Duty not found' }, { status: 404 })

  try {
    const found = await occurrenceFor({ dutyId, date, assigneeId })
    if (!found) return notFound

    const viewer = {
      permissions: actor.permissions,
      brandAccess: actor.brandAccess,
      teamMemberId: me,
      calendarScope: calendarPeopleScope({
        permissions: actor.permissions, brandAccess: actor.brandAccess, teamMemberId: me, email: actor.email,
      }),
    }
    const access = {
      targetedIds: found.targetedIds,
      dutyBrandId: found.occurrence.duty.brand_id,
      assigneeId,
      hasOwnLog: !!me && found.occurrence.log?.assignee_id === me,
      assigneeBrandIds: found.assigneeBrandIds,
    }
    if (!canViewDutyOccurrence(viewer, access)) return notFound

    const [occurrence] = await toOccurrenceDtos([found.occurrence])
    const work = canWorkDutyOccurrence(viewer, access)
    return NextResponse.json({ ok: true, occurrence, canWork: work.allowed, onBehalf: work.onBehalf })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

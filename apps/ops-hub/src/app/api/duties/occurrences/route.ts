import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { memberForEmail } from '@/lib/team'
import { occurrencesOn, overdueOccurrences } from '@/lib/dutyOccurrences'
import { dutyScope } from '@/lib/dutyModel'
import { todayInEat } from '@/lib/serverClient'

/**
 * Duty occurrences for a date. An occurrence is DERIVED (duty × date × person)
 * — this route never generates rows, so the same occurrence displayed here, in
 * My Tasks, on the calendar and in the morning brief stays ONE record.
 *
 * Scope comes from the caller's permissions, never from a query parameter:
 *   ?mine=1  narrows to the caller's own occurrences (always allowed)
 *   default  applies dutyScope() — all / brand-scoped / own
 */
export async function GET(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const date = url.searchParams.get('date') || todayInEat()
  const mine = url.searchParams.get('mine') === '1'
  const includeOverdue = url.searchParams.get('overdue') === '1'

  const me = await memberForEmail(actor.email)
  const scope = mine
    ? ({ kind: 'own' } as const)
    : dutyScope({ permissions: actor.permissions, brandAccess: actor.brandAccess, teamMemberId: me?.id ?? null })

  // A caller with no team-member row is scoped to nothing, not to everything.
  if (scope.kind === 'own' && !me) {
    return NextResponse.json({ ok: true, date, occurrences: [], overdue: [] })
  }

  try {
    const occurrences = await occurrencesOn(date, { scope, teamMemberId: me?.id ?? null })
    const overdue = includeOverdue
      ? await overdueOccurrences({ scope, teamMemberId: me?.id ?? null, date })
      : []
    return NextResponse.json({ ok: true, date, occurrences, overdue })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

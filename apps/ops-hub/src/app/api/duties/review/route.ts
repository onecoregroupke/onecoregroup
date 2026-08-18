import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { memberForEmail } from '@/lib/team'
import { reviewDutyOccurrence, pendingReviews } from '@/lib/dutyOccurrences'
import { dutyCan, dutyScope } from '@/lib/dutyModel'
import { auditEvent } from '@/lib/audit'
import { db } from '@/lib/serverClient'

/** Occurrences awaiting a manager decision, within the caller's scope. */
export async function GET(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const me = await memberForEmail(actor.email)
  const dutyActor = { permissions: actor.permissions, brandAccess: actor.brandAccess, teamMemberId: me?.id ?? null }
  if (!dutyCan(dutyActor, 'review')) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }
  const rows = await pendingReviews(dutyScope(dutyActor))
  return NextResponse.json({ ok: true, rows })
}

/**
 * Accept or reopen a submitted occurrence (§13).
 *
 * A reviewer may not accept their own work. This mirrors the rule already
 * enforced on requisitions and completion reports — the person who did the
 * thing cannot be the person who signs it off.
 */
export async function POST(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const me = await memberForEmail(actor.email)
  const dutyActor = { permissions: actor.permissions, brandAccess: actor.brandAccess, teamMemberId: me?.id ?? null }
  if (!dutyCan(dutyActor, 'review')) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    if (!body?.log_id) return NextResponse.json({ ok: false, error: 'log_id is required' }, { status: 400 })
    const decision = body.decision === 'reopen' ? 'reopen' : 'accept'

    const { data: existing } = await db()
      .from('ocg_daily_duty_logs')
      .select('*')
      .eq('id', body.log_id)
      .maybeSingle()
    if (!existing) return NextResponse.json({ ok: false, error: 'Occurrence not found' }, { status: 404 })
    const before = existing as Record<string, unknown>

    // No self-review. Checked on the team-member id (the occurrence key) and on
    // the recorded completer name, since either can identify the same person.
    const isOwn =
      (me?.id != null && before['assignee_id'] === me.id) ||
      (String(before['completed_by'] ?? '').trim().toLowerCase() ===
        (actor.name || '').trim().toLowerCase() && !!actor.name)
    if (isOwn && actor.permissions !== null) {
      return NextResponse.json(
        { ok: false, error: 'You cannot review your own duty completion.' },
        { status: 403 },
      )
    }

    const row = await reviewDutyOccurrence({
      log_id: body.log_id,
      decision,
      comment: body.comment ?? '',
      quality_rating: body.quality_rating ?? null,
      reviewed_by: actor.name || actor.email || actor.userId,
    })

    await auditEvent({
      actor,
      action: `duty.review.${decision}`,
      entity_table: 'ocg_daily_duty_logs',
      entity_id: row.id,
      entity_label: `${decision} · ${row.duty_date}`,
      before_data: before,
      after_data: row as unknown as Record<string, unknown>,
    })

    return NextResponse.json({ ok: true, row })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

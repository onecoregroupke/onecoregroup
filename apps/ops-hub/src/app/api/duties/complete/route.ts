import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { memberForEmail } from '@/lib/team'
import { completeDutyOccurrence, DutyCompletionError } from '@/lib/dutyOccurrences'
import { dutyCan } from '@/lib/dutyModel'
import { auditEvent } from '@/lib/audit'

/**
 * Record a duty occurrence result (§12). Requirements — note, evidence,
 * checklist, required form — are enforced in the service, so every caller
 * (this route, the morning brief, a future mobile client) is gated identically.
 *
 * A user may only complete an occurrence targeted at THEMSELVES. Completing on
 * someone else's behalf needs `duties` edit, and is recorded as such.
 */
export async function POST(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    if (!body?.duty_id) {
      return NextResponse.json({ ok: false, error: 'duty_id is required' }, { status: 400 })
    }

    const me = await memberForEmail(actor.email)
    // The occurrence being completed. Default to the caller's own.
    const assigneeId: string | null = body.assignee_id ?? me?.id ?? null

    const onBehalf = assigneeId !== (me?.id ?? null)
    if (onBehalf && !dutyCan({ permissions: actor.permissions, brandAccess: actor.brandAccess }, 'edit')) {
      return NextResponse.json(
        { ok: false, error: 'You may only complete duties assigned to you.' },
        { status: 403 },
      )
    }

    const row = await completeDutyOccurrence({
      duty_id: body.duty_id,
      assignee_id: assigneeId,
      date: body.date,
      status: body.status ?? 'done',
      note: body.note ?? '',
      completed_by: actor.name || actor.email || actor.userId,
      attachment_count: Number(body.attachment_count ?? 0),
      form_submission_id: body.form_submission_id ?? null,
      checklist: body.checklist ?? undefined,
    })

    await auditEvent({
      actor,
      action: onBehalf ? 'duty.complete_on_behalf' : 'duty.complete',
      entity_table: 'ocg_daily_duty_logs',
      entity_id: row.id,
      entity_label: `${body.status ?? 'done'} · ${row.duty_date}`,
      after_data: row as unknown as Record<string, unknown>,
    })

    return NextResponse.json({ ok: true, row })
  } catch (e) {
    // Unmet requirements come back as a list so the UI can show them at once.
    if (e instanceof DutyCompletionError) {
      return NextResponse.json({ ok: false, error: e.message, problems: e.problems }, { status: 422 })
    }
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { completeDutyOccurrence, dutyTargetIds, DutyCompletionError } from '@/lib/dutyOccurrences'
import { canWorkDutyOccurrence } from '@/lib/dutyModel'
import { auditEvent } from '@/lib/audit'
import { db } from '@/lib/serverClient'
import type { OcgDailyDutyRow } from '@ocg/db'

/**
 * Record a duty occurrence result (§12). Requirements — note, evidence,
 * checklist, required form — are enforced in the service, so every caller
 * (this route, the morning brief, a future mobile client) is gated identically.
 *
 * `status: 'pending'` with a checklist map is how progress is saved during the
 * day: the ticks for that DATE are stored and the definition is never touched.
 *
 * A user may only work an occurrence of a duty that actually targets them.
 * Working someone else's needs duty edit rights within the duty's brand, and is
 * recorded as on-behalf.
 */
export async function POST(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    if (!body?.duty_id) {
      return NextResponse.json({ ok: false, error: 'duty_id is required' }, { status: 400 })
    }

    const me = actor.teamMemberId
    // The occurrence being worked. Omitted means the caller's own; an explicit
    // null is an unassigned occurrence (managers only).
    const assigneeId: string | null = body.assignee_id === undefined ? me : (body.assignee_id || null)

    const { data: dutyRow } = await db().from('ocg_daily_duties').select('*').eq('id', String(body.duty_id)).maybeSingle()
    const duty = (dutyRow as OcgDailyDutyRow | null) ?? null
    if (!duty) return NextResponse.json({ ok: false, error: 'Duty not found' }, { status: 404 })

    const access = canWorkDutyOccurrence(
      { permissions: actor.permissions, brandAccess: actor.brandAccess, teamMemberId: me },
      { targetedIds: await dutyTargetIds(duty), dutyBrandId: duty.brand_id, assigneeId },
    )
    if (!access.allowed) {
      return NextResponse.json(
        { ok: false, error: 'You may only complete duties assigned to you.' },
        { status: 403 },
      )
    }

    const status = String(body.status ?? 'done')
    const row = await completeDutyOccurrence({
      duty_id: duty.id,
      assignee_id: assigneeId,
      date: body.date,
      status,
      note: body.note ?? '',
      completed_by: actor.name || actor.email || actor.userId,
      attachment_count: Number(body.attachment_count ?? 0),
      // Absent means "leave the linked form as it is", not "detach it".
      form_submission_id: body.form_submission_id === undefined ? undefined : (body.form_submission_id || null),
      checklist: body.checklist ?? undefined,
    })

    await auditEvent({
      actor,
      action: access.onBehalf
        ? (status === 'pending' ? 'duty.progress_on_behalf' : 'duty.complete_on_behalf')
        : (status === 'pending' ? 'duty.progress' : 'duty.complete'),
      entity_table: 'ocg_daily_duty_logs',
      entity_id: row.id,
      entity_label: `${status} · ${row.duty_date} · ${row.checklist_done}/${row.checklist_total}`,
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

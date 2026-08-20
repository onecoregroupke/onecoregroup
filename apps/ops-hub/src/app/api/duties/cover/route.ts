import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { coverDutyOccurrence } from '@/lib/dutyOccurrences'
import { dutyCan } from '@/lib/dutyModel'
import { db } from '@/lib/serverClient'
import { auditEvent } from '@/lib/audit'

/** Apply cover to one occurrence. The template and original assignee are never
 * overwritten; the substitute and reason are stored on the occurrence and in
 * an append-only assignment-event row. */
export async function POST(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  if (!dutyCan({ permissions: actor.permissions, brandAccess: actor.brandAccess }, 'edit')) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const { data: duty } = await db().from('ocg_daily_duties').select('id, brand_id, title')
      .eq('id', String(body?.duty_id ?? '')).maybeSingle()
    if (!duty) return NextResponse.json({ ok: false, error: 'Duty not found' }, { status: 404 })
    const allowed = actor.allowedBrandIds('duties')
    if (allowed !== null && (!(duty as { brand_id: string | null }).brand_id || !allowed.includes((duty as { brand_id: string }).brand_id))) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }
    const row = await coverDutyOccurrence({
      duty_id: String(body.duty_id),
      duty_date: String(body.duty_date),
      original_assignee_id: String(body.original_assignee_id),
      substitute_assignee_id: String(body.substitute_assignee_id),
      reason: String(body.reason ?? ''),
      changed_by: actor.name || actor.email || actor.userId,
    })
    await auditEvent({
      actor,
      action: 'duty.cover.assign',
      entity_table: 'ocg_daily_duty_logs',
      entity_id: row.id,
      entity_label: `${(duty as { title: string }).title} · ${row.duty_date}`,
      after_data: row as unknown as Record<string, unknown>,
    })
    return NextResponse.json({ ok: true, row })
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 })
  }
}


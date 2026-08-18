import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { memberForEmail } from '@/lib/team'
import { createDuty, updateDuty, listDuties } from '@/lib/duties'
import { setChecklistItems } from '@/lib/dutyOccurrences'
import { dutyCan, canAssignDutyInBrand, dutyScope, DUTY_TARGET_KINDS, DUTY_KINDS } from '@/lib/dutyModel'
import { auditEvent } from '@/lib/audit'
import { db } from '@/lib/serverClient'

/** Duty templates within the caller's scope. */
export async function GET(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const me = await memberForEmail(actor.email)
  const scope = dutyScope({ permissions: actor.permissions, brandAccess: actor.brandAccess, teamMemberId: me?.id ?? null })

  const all = await listDuties({ activeOnly: new URL(req.url).searchParams.get('all') !== '1' })
  const rows = all.filter((d) => {
    if (scope.kind === 'all') return true
    if (scope.kind === 'brands') return !!d.brand_id && scope.brandIds.includes(d.brand_id)
    return me?.id != null && d.assignee_id === me.id
  })
  return NextResponse.json({ ok: true, rows })
}

/** Normalise the schedule + targeting payload shared by POST and PATCH. */
function readConfig(body: Record<string, unknown>) {
  const targetKind = String(body['target_kind'] ?? 'employee')
  const dutyKind = String(body['duty_kind'] ?? 'task')
  return {
    title: String(body['title'] ?? '').trim(),
    description: String(body['description'] ?? ''),
    instructions: String(body['instructions'] ?? ''),
    department: String(body['department'] ?? 'Operations'),
    category: String(body['category'] ?? ''),
    location: String(body['location'] ?? ''),
    priority: String(body['priority'] ?? 'Medium'),
    duty_kind: (DUTY_KINDS as readonly string[]).includes(dutyKind) ? dutyKind : 'task',

    // Targeting. A blank target resolves to NOBODY, never to everybody —
    // resolveDutyAssignees() enforces that; this only normalises the input.
    target_kind: (DUTY_TARGET_KINDS as readonly string[]).includes(targetKind) ? targetKind : 'employee',
    assignee_id: targetKind === 'employee' ? (body['assignee_id'] as string) || null : null,
    brand_id: (body['brand_id'] as string) || null,
    target_team: targetKind === 'team' ? String(body['target_team'] ?? '').trim() : '',
    target_department: targetKind === 'department' ? String(body['target_department'] ?? '').trim() : '',
    target_role: targetKind === 'role' ? String(body['target_role'] ?? '').trim() : '',
    target_location: targetKind === 'location' ? String(body['target_location'] ?? '').trim() : '',

    // Schedule
    frequency: String(body['frequency'] ?? 'daily'),
    weekdays: Array.isArray(body['weekdays']) ? (body['weekdays'] as unknown[]).map(Number) : [],
    day_of_month:
      body['day_of_month'] === '' || body['day_of_month'] == null ? null : Number(body['day_of_month']),
    interval_days: body['interval_days'] ? Number(body['interval_days']) : 0,
    time_of_day: String(body['time_of_day'] ?? ''),
    timezone: String(body['timezone'] || 'Africa/Nairobi'),
    start_date: (body['start_date'] as string) || null,
    end_date: (body['end_date'] as string) || null,
    skip_holidays: body['skip_holidays'] === true,

    // Requirements + review
    requires_note: body['requires_note'] === true,
    requires_proof: body['requires_proof'] === true,
    requires_checklist: body['requires_checklist'] === true,
    requires_approval: body['requires_approval'] === true,
    required_form_template_id: (body['required_form_template_id'] as string) || null,
    reviewer_id: (body['reviewer_id'] as string) || null,
    grace_minutes: body['grace_minutes'] ? Number(body['grace_minutes']) : 0,
    escalation_minutes: body['escalation_minutes'] ? Number(body['escalation_minutes']) : 0,
    reminder_minutes: body['reminder_minutes'] ? Number(body['reminder_minutes']) : 0,
    sort_order: typeof body['sort_order'] === 'number' ? (body['sort_order'] as number) : 0,
  }
}

export async function POST(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const me = await memberForEmail(actor.email)
  const dutyActor = { permissions: actor.permissions, brandAccess: actor.brandAccess, teamMemberId: me?.id ?? null }
  if (!dutyCan(dutyActor, 'create')) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const config = readConfig(body)
    if (!config.title) return NextResponse.json({ ok: false, error: 'Duty title is required.' }, { status: 400 })

    // A brand-scoped manager may only assign inside their own brands, and may
    // not create a group-wide (brand-less) duty.
    if (!canAssignDutyInBrand(dutyActor, config.brand_id)) {
      return NextResponse.json(
        { ok: false, error: 'You may only create duties within the brands you manage.' },
        { status: 403 },
      )
    }

    const row = await createDuty({ ...config, created_by: actor.name || actor.email || actor.userId })

    // Checklist items may be supplied inline when the duty is created.
    if (Array.isArray(body?.checklist) && body.checklist.length > 0) {
      await setChecklistItems(
        row.id,
        (body.checklist as Array<{ label?: string; hint?: string; required?: boolean }>)
          .map((i) => ({ label: String(i.label ?? '').trim(), hint: String(i.hint ?? ''), required: i.required !== false }))
          .filter((i) => i.label.length > 0),
      )
    }

    await auditEvent({
      actor,
      action: 'duty.create',
      entity_table: 'ocg_daily_duties',
      entity_id: row.id,
      entity_label: row.title,
      after_data: row as unknown as Record<string, unknown>,
    })

    return NextResponse.json({ ok: true, row }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

export async function PATCH(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const me = await memberForEmail(actor.email)
  const dutyActor = { permissions: actor.permissions, brandAccess: actor.brandAccess, teamMemberId: me?.id ?? null }

  try {
    const body = await req.json()
    if (!body?.id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })

    const { data: existing } = await db().from('ocg_daily_duties').select('*').eq('id', body.id).maybeSingle()
    if (!existing) return NextResponse.json({ ok: false, error: 'Duty not found' }, { status: 404 })
    const before = existing as Record<string, unknown>

    // Pausing/ending is a narrower capability than editing the definition.
    const onlyLifecycle = Object.keys(body).every((k) => ['id', 'paused', 'active'].includes(k))
    const capability = onlyLifecycle ? (body.active === false ? 'end' : 'pause') : 'edit'
    if (!dutyCan(dutyActor, capability)) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }
    // Scope check against the duty's CURRENT brand, so a scoped manager cannot
    // edit a duty outside their brands (nor move one into them).
    if (!canAssignDutyInBrand(dutyActor, (before['brand_id'] as string | null) ?? null)) {
      return NextResponse.json({ ok: false, error: 'This duty is outside the brands you manage.' }, { status: 403 })
    }

    const { id, checklist, ...rest } = body
    const fields = onlyLifecycle
      ? rest
      : { ...readConfig(body), updated_by: actor.name || actor.email || actor.userId }
    const row = await updateDuty(id, fields)

    if (Array.isArray(checklist)) {
      await setChecklistItems(
        id,
        (checklist as Array<{ id?: string; label?: string; hint?: string; required?: boolean }>)
          .map((i) => ({ id: i.id, label: String(i.label ?? '').trim(), hint: String(i.hint ?? ''), required: i.required !== false }))
          .filter((i) => i.label.length > 0),
      )
    }

    await auditEvent({
      actor,
      action: onlyLifecycle ? 'duty.lifecycle' : 'duty.update',
      entity_table: 'ocg_daily_duties',
      entity_id: row.id,
      entity_label: row.title,
      before_data: before,
      after_data: row as unknown as Record<string, unknown>,
    })

    return NextResponse.json({ ok: true, row })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { createTeamMember, listTeam, updateTeamMember } from '@/lib/team'
import { auditEvent } from '@/lib/audit'

// The roster (names + emails) feeds the assignee picker — restrict to users who
// can act on the task system rather than any signed-in user.
export async function GET(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  if (!actor.can('ops', 'view') && !actor.isSuperAdmin) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }
  const team = await listTeam()
  return NextResponse.json({ ok: true, team })
}

export async function POST(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  if (!actor.can('ops', 'edit') && !actor.isSuperAdmin) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const row = await createTeamMember({
      name: body?.name ?? '',
      email: body?.email,
      role: body?.role,
      brand_ids: Array.isArray(body?.brand_ids) ? body.brand_ids : [],
      active: body?.active ?? true,
      phone: body?.phone,
      job_title: body?.job_title,
      department: body?.department,
      start_date: body?.start_date,
      notes: body?.notes,
    })
    await auditEvent({
      actor,
      action: 'create',
      entity_table: 'ops_team_members',
      entity_id: row.id,
      entity_label: row.name,
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
  if (!actor.can('ops', 'edit') && !actor.can('management', 'edit') && !actor.isSuperAdmin) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const before = (await listTeam()).find((m) => m.id === body?.id) ?? null
    const row = await updateTeamMember(String(body?.id ?? ''), {
      name: body?.name,
      email: body?.email,
      role: body?.role,
      brand_ids: Array.isArray(body?.brand_ids) ? body.brand_ids : undefined,
      active: body?.active,
      phone: body?.phone,
      job_title: body?.job_title,
      department: body?.department,
      start_date: body?.start_date,
      notes: body?.notes,
    })
    await auditEvent({
      actor,
      action: 'update',
      entity_table: 'ops_team_members',
      entity_id: row.id,
      entity_label: row.name,
      before_data: before as unknown as Record<string, unknown> | null,
      after_data: row as unknown as Record<string, unknown>,
    })
    return NextResponse.json({ ok: true, row })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

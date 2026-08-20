import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { listTeam, memberForEmail } from '@/lib/team'
import { listBrands } from '@/lib/brands'
import { canAccessEmployee } from '@/lib/governanceModel'
import {
  assignCapability, createCover, createEntityAssignment, createQualification,
  createResource, createResponsibility, getEmployeeProfile, grantAuthority,
  updateJobDescription,
} from '@/lib/people'
import { auditEvent } from '@/lib/audit'

type Params = { params: Promise<{ memberId: string }> }

async function context(req: NextRequest, memberId: string) {
  const actor = await getApiActor(req)
  if (!actor) return { error: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }) }
  if (!actor.can('people', 'view')) {
    return { error: NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 }) }
  }
  const [profile, me] = await Promise.all([getEmployeeProfile(memberId), memberForEmail(actor.email)])
  if (!profile) return { error: NextResponse.json({ ok: false, error: 'not found' }, { status: 404 }) }
  const allowed = actor.allowedBrandIds('people')
  const accessible = canAccessEmployee({
    memberId: me?.id ?? null,
    department: me?.department ?? '',
    brandIds: allowed,
    scope: actor.recordScope('people'),
  }, {
    memberId: profile.member.id,
    department: profile.member.department,
    brandIds: profile.member.brand_ids,
  })
  if (!accessible) return { error: NextResponse.json({ ok: false, error: 'not found' }, { status: 404 }) }
  return { actor, profile, me }
}

export async function GET(req: NextRequest, { params }: Params) {
  const { memberId } = await params
  const ctx = await context(req, memberId)
  if ('error' in ctx) return ctx.error
  const [team, brands] = await Promise.all([listTeam(), listBrands()])
  return NextResponse.json({
    ok: true,
    profile: ctx.profile,
    team: team.map((member) => ({ id: member.id, name: member.name })),
    brands: brands.map((brand) => ({ id: brand.id, name: brand.short_name || brand.name })),
    canEdit: ctx.actor.can('people', 'edit') && ['management', 'group'].includes(ctx.actor.recordScope('people')),
  })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { memberId } = await params
  const ctx = await context(req, memberId)
  if ('error' in ctx) return ctx.error
  if (!ctx.actor.can('people', 'edit') || !['management', 'group'].includes(ctx.actor.recordScope('people'))) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const action = String(body?.action ?? '')
    const values = body?.values ?? {}
    const actorName = ctx.actor.name || ctx.actor.email || ctx.actor.userId
    let row: Record<string, unknown>
    let table: string
    if (action === 'job-description') {
      row = await updateJobDescription(memberId, String(values.job_description ?? '')) as unknown as Record<string, unknown>
      table = 'ops_team_members'
    } else if (action === 'add-assignment') {
      row = await createEntityAssignment({
        member_id: memberId, brand_id: String(values.brand_id ?? ''),
        department: String(values.department ?? ''), operational_area: String(values.operational_area ?? ''),
        role_title: String(values.role_title ?? ''), assignment_kind: values.assignment_kind ?? 'additional',
        is_primary: values.is_primary === true, reporting_manager_id: values.reporting_manager_id || null,
        effective_from: values.effective_from || null, effective_until: values.effective_until || null,
        active: true, created_by: actorName,
      }) as unknown as Record<string, unknown>
      table = 'employee_entity_assignments'
    } else if (action === 'add-responsibility') {
      row = await createResponsibility({
        member_id: memberId, brand_id: values.brand_id || null, title: String(values.title ?? ''),
        description: String(values.description ?? ''), responsibility_type: values.responsibility_type ?? 'formal',
        cadence: String(values.cadence ?? ''), criticality: String(values.criticality ?? 'normal'), created_by: actorName,
      }) as unknown as Record<string, unknown>
      table = 'employee_responsibilities'
    } else if (action === 'add-capability') {
      row = await assignCapability({
        member_id: memberId, code: String(values.code ?? ''), title: String(values.title ?? ''),
        operational_area: String(values.operational_area ?? ''), brand_id: values.brand_id || null,
        proficiency: values.proficiency ?? 'working', evidence_notes: String(values.evidence_notes ?? ''), actor: actorName,
      }) as unknown as Record<string, unknown>
      table = 'employee_capability_assignments'
    } else if (action === 'grant-authority') {
      row = await grantAuthority({
        member_id: memberId, brand_id: values.brand_id || null,
        operational_area: String(values.operational_area ?? ''), resource_type: String(values.resource_type ?? ''),
        authority_action: values.authority_action, authority_scope: values.authority_scope ?? 'own',
        limit_amount_ksh: values.limit_amount_ksh === '' || values.limit_amount_ksh == null ? null : Number(values.limit_amount_ksh),
        granted_by: actorName, grant_reason: String(values.grant_reason ?? ''),
        effective_from: values.effective_from || new Date().toISOString().slice(0, 10), effective_until: values.effective_until || null,
      }) as unknown as Record<string, unknown>
      table = 'employee_authorities'
    } else if (action === 'add-cover') {
      row = await createCover({
        covered_member_id: memberId, cover_member_id: String(values.cover_member_id ?? ''),
        capability_id: values.capability_id || null, brand_id: values.brand_id || null,
        process_name: String(values.process_name ?? ''), cover_type: values.cover_type ?? 'primary',
        reason: String(values.reason ?? ''), effective_from: values.effective_from || null,
        effective_until: values.effective_until || null, approved_by: actorName,
      }) as unknown as Record<string, unknown>
      table = 'employee_cover_assignments'
    } else if (action === 'add-resource') {
      row = await createResource({
        member_id: memberId, brand_id: values.brand_id || null, resource_type: String(values.resource_type ?? ''),
        resource_name: String(values.resource_name ?? ''), resource_reference: String(values.resource_reference ?? ''),
        responsibility: String(values.responsibility ?? ''), effective_from: values.effective_from || null,
        effective_until: values.effective_until || null, created_by: actorName,
      }) as unknown as Record<string, unknown>
      table = 'employee_resource_assignments'
    } else if (action === 'add-qualification') {
      row = await createQualification({
        member_id: memberId, qualification_type: values.qualification_type ?? 'training',
        title: String(values.title ?? ''), provider: String(values.provider ?? ''),
        completed_on: values.completed_on || null, expires_on: values.expires_on || null,
        evidence_url: String(values.evidence_url ?? ''), status: String(values.status ?? 'current'),
        notes: String(values.notes ?? ''), created_by: actorName,
      }) as unknown as Record<string, unknown>
      table = 'employee_qualifications'
    } else {
      return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
    }
    await auditEvent({
      actor: ctx.actor,
      action: action === 'grant-authority' ? 'employee.authority.grant' : `employee.${action}`,
      entity_table: table,
      entity_id: String(row.id ?? memberId),
      entity_label: ctx.profile.member.name,
      after_data: row,
    })
    return NextResponse.json({ ok: true, row }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 })
  }
}


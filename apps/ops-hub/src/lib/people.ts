import { db, nowIso } from './serverClient'
import type {
  OpsTeamMemberRow, EmployeeEntityAssignmentRow, EmployeeResponsibilityRow,
  EmployeeCapabilityRow, EmployeeCapabilityAssignmentRow, EmployeeAuthorityRow,
  EmployeeCoverAssignmentRow, EmployeeResourceAssignmentRow,
  EmployeeQualificationRow, EmployeeActivityHistoryRow,
  OcgDailyDutyRow,
} from '@ocg/db'

export interface EmployeeProfile {
  member: OpsTeamMemberRow
  assignments: EmployeeEntityAssignmentRow[]
  responsibilities: EmployeeResponsibilityRow[]
  capabilities: Array<EmployeeCapabilityAssignmentRow & { capability?: EmployeeCapabilityRow }>
  authorities: EmployeeAuthorityRow[]
  cover: EmployeeCoverAssignmentRow[]
  resources: EmployeeResourceAssignmentRow[]
  qualifications: EmployeeQualificationRow[]
  activity: EmployeeActivityHistoryRow[]
  duties: OcgDailyDutyRow[]
}

export async function getEmployeeProfile(memberId: string): Promise<EmployeeProfile | null> {
  const supabase = db()
  const { data: member } = await supabase.from('ops_team_members').select('*').eq('id', memberId).maybeSingle()
  if (!member) return null
  const [assignments, responsibilities, capabilityAssignments, authorities, cover, resources, qualifications, activity, duties] = await Promise.all([
    supabase.from('employee_entity_assignments').select('*').eq('member_id', memberId).order('is_primary', { ascending: false }),
    supabase.from('employee_responsibilities').select('*').eq('member_id', memberId).order('created_at', { ascending: true }),
    supabase.from('employee_capability_assignments').select('*').eq('member_id', memberId).eq('active', true),
    supabase.from('employee_authorities').select('*').eq('member_id', memberId).order('created_at', { ascending: false }),
    supabase.from('employee_cover_assignments').select('*').or(`covered_member_id.eq.${memberId},cover_member_id.eq.${memberId}`).order('created_at', { ascending: false }),
    supabase.from('employee_resource_assignments').select('*').eq('member_id', memberId).order('created_at', { ascending: false }),
    supabase.from('employee_qualifications').select('*').eq('member_id', memberId).order('completed_on', { ascending: false }),
    supabase.from('employee_activity_history').select('*').eq('member_id', memberId).order('activity_date', { ascending: false }).limit(100),
    supabase.from('ocg_daily_duties').select('*').eq('assignee_id', memberId).eq('active', true).order('title'),
  ])
  const capRows = (capabilityAssignments.data as EmployeeCapabilityAssignmentRow[] | null) ?? []
  let capabilityById = new Map<string, EmployeeCapabilityRow>()
  if (capRows.length > 0) {
    const { data } = await supabase.from('employee_capabilities').select('*').in('id', capRows.map((row) => row.capability_id))
    capabilityById = new Map(((data as EmployeeCapabilityRow[] | null) ?? []).map((row) => [row.id, row]))
  }
  return {
    member: member as OpsTeamMemberRow,
    assignments: (assignments.data as EmployeeEntityAssignmentRow[] | null) ?? [],
    responsibilities: (responsibilities.data as EmployeeResponsibilityRow[] | null) ?? [],
    capabilities: capRows.map((row) => ({ ...row, capability: capabilityById.get(row.capability_id) })),
    authorities: (authorities.data as EmployeeAuthorityRow[] | null) ?? [],
    cover: (cover.data as EmployeeCoverAssignmentRow[] | null) ?? [],
    resources: (resources.data as EmployeeResourceAssignmentRow[] | null) ?? [],
    qualifications: (qualifications.data as EmployeeQualificationRow[] | null) ?? [],
    activity: (activity.data as EmployeeActivityHistoryRow[] | null) ?? [],
    duties: (duties.data as OcgDailyDutyRow[] | null) ?? [],
  }
}

export async function updateJobDescription(memberId: string, jobDescription: string): Promise<OpsTeamMemberRow> {
  const { data, error } = await db().from('ops_team_members').update({
    job_description: jobDescription.trim(), updated_at: nowIso(),
  }).eq('id', memberId).select('*').single()
  if (error) throw new Error(error.message)
  return data as OpsTeamMemberRow
}

export async function createEntityAssignment(input: Omit<EmployeeEntityAssignmentRow, 'id' | 'created_at' | 'updated_at'>): Promise<EmployeeEntityAssignmentRow> {
  const { data, error } = await db().from('employee_entity_assignments').insert(input).select('*').single()
  if (error) throw new Error(error.message)
  return data as EmployeeEntityAssignmentRow
}

export async function createResponsibility(input: Pick<EmployeeResponsibilityRow, 'member_id' | 'brand_id' | 'title' | 'description' | 'responsibility_type' | 'cadence' | 'criticality' | 'created_by'>): Promise<EmployeeResponsibilityRow> {
  const { data, error } = await db().from('employee_responsibilities').insert(input).select('*').single()
  if (error) throw new Error(error.message)
  return data as EmployeeResponsibilityRow
}

export async function assignCapability(input: {
  member_id: string
  code: string
  title: string
  operational_area?: string
  brand_id?: string | null
  proficiency?: EmployeeCapabilityAssignmentRow['proficiency']
  evidence_notes?: string
  actor: string
}): Promise<EmployeeCapabilityAssignmentRow> {
  const supabase = db()
  const capabilityQuery = supabase.from('employee_capabilities').select('*').ilike('code', input.code.trim())
  const { data: existing } = await (input.brand_id
    ? capabilityQuery.eq('brand_id', input.brand_id)
    : capabilityQuery.is('brand_id', null)).maybeSingle()
  let capability = existing as EmployeeCapabilityRow | null
  if (!capability) {
    const { data, error } = await supabase.from('employee_capabilities').insert({
      code: input.code.trim(), title: input.title.trim(), operational_area: input.operational_area ?? '',
      brand_id: input.brand_id ?? null, created_by: input.actor,
    }).select('*').single()
    if (error) throw new Error(error.message)
    capability = data as EmployeeCapabilityRow
  }
  const { data: assigned } = await supabase.from('employee_capability_assignments').select('*')
    .eq('member_id', input.member_id).eq('capability_id', capability.id).maybeSingle()
  const payload = {
    member_id: input.member_id,
    capability_id: capability.id,
    proficiency: input.proficiency ?? 'working',
    evidence_notes: input.evidence_notes ?? '',
    created_by: input.actor,
    active: true,
    updated_at: nowIso(),
  }
  const mutation = assigned
    ? supabase.from('employee_capability_assignments').update(payload).eq('id', (assigned as EmployeeCapabilityAssignmentRow).id)
    : supabase.from('employee_capability_assignments').insert(payload)
  const { data, error } = await mutation.select('*').single()
  if (error) throw new Error(error.message)
  return data as EmployeeCapabilityAssignmentRow
}

export async function grantAuthority(input: Pick<EmployeeAuthorityRow,
  'member_id' | 'brand_id' | 'operational_area' | 'resource_type' | 'authority_action' |
  'authority_scope' | 'limit_amount_ksh' | 'granted_by' | 'grant_reason' | 'effective_from' | 'effective_until'
>): Promise<EmployeeAuthorityRow> {
  const { data, error } = await db().from('employee_authorities').insert(input).select('*').single()
  if (error) throw new Error(error.message)
  return data as EmployeeAuthorityRow
}

export async function createCover(input: Pick<EmployeeCoverAssignmentRow,
  'covered_member_id' | 'cover_member_id' | 'capability_id' | 'brand_id' | 'process_name' |
  'cover_type' | 'reason' | 'effective_from' | 'effective_until' | 'approved_by'
>): Promise<EmployeeCoverAssignmentRow> {
  const { data, error } = await db().from('employee_cover_assignments').insert(input).select('*').single()
  if (error) throw new Error(error.message)
  return data as EmployeeCoverAssignmentRow
}

export async function createResource(input: Pick<EmployeeResourceAssignmentRow,
  'member_id' | 'brand_id' | 'resource_type' | 'resource_name' | 'resource_reference' |
  'responsibility' | 'effective_from' | 'effective_until' | 'created_by'
>): Promise<EmployeeResourceAssignmentRow> {
  const { data, error } = await db().from('employee_resource_assignments').insert(input).select('*').single()
  if (error) throw new Error(error.message)
  return data as EmployeeResourceAssignmentRow
}

export async function createQualification(input: Pick<EmployeeQualificationRow,
  'member_id' | 'qualification_type' | 'title' | 'provider' | 'completed_on' | 'expires_on' |
  'evidence_url' | 'status' | 'notes' | 'created_by'
>): Promise<EmployeeQualificationRow> {
  const { data, error } = await db().from('employee_qualifications').insert(input).select('*').single()
  if (error) throw new Error(error.message)
  return data as EmployeeQualificationRow
}

import { db } from './serverClient'
import type { OpsTeamMemberRow } from '@ocg/db'

export async function listTeam(): Promise<OpsTeamMemberRow[]> {
  const { data } = await db()
    .from('ops_team_members')
    .select('*')
    .eq('active', true)
    .order('name', { ascending: true })
  return (data as OpsTeamMemberRow[] | null) ?? []
}

/** Resolve an assignee name to their email by exact or first-name match. */
export function lookupAssigneeEmail(
  team: OpsTeamMemberRow[],
  assignee: string,
): string | undefined {
  if (!assignee) return undefined
  const lower = assignee.trim().toLowerCase()
  const exact = team.find((m) => m.name.toLowerCase() === lower)
  if (exact?.email) return exact.email
  const first = lower.split(' ')[0]
  const prefix = team.find((m) => m.name.toLowerCase().startsWith(first ?? ''))
  return prefix?.email ?? undefined
}

/** Ensure an ops_team_members row exists for an invited portal user, matched by
 *  email (case-insensitive). Keeps name/brand scope in sync so /my-tasks and
 *  assignment-by-name work for people who log into their portal. */
export async function upsertTeamMemberByEmail(input: {
  email: string
  name: string
  role?: string
  brand_ids?: string[]
}): Promise<void> {
  const email = input.email.trim().toLowerCase()
  if (!email) return
  const supabase = db()
  const { data: existing } = await supabase
    .from('ops_team_members')
    .select('*')
    .ilike('email', email)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('ops_team_members')
      .update({
        name: input.name.trim() || (existing as OpsTeamMemberRow).name,
        role: input.role?.trim() || (existing as OpsTeamMemberRow).role,
        brand_ids: input.brand_ids ?? (existing as OpsTeamMemberRow).brand_ids,
        active: true,
      })
      .eq('id', (existing as OpsTeamMemberRow).id)
    return
  }

  await supabase.from('ops_team_members').insert({
    name: input.name.trim() || email.split('@')[0],
    email,
    role: input.role?.trim() || 'Team member',
    brand_ids: input.brand_ids ?? [],
    active: true,
  })
}

/** Deactivate the team member linked to an email (when a portal user is removed). */
export async function deactivateTeamMemberByEmail(email: string): Promise<void> {
  const clean = email.trim().toLowerCase()
  if (!clean) return
  await db().from('ops_team_members').update({ active: false }).ilike('email', clean)
}

export async function createTeamMember(input: {
  name: string
  email?: string
  role?: string
  brand_ids?: string[]
  active?: boolean
  phone?: string
  job_title?: string
  department?: string
  start_date?: string | null
  notes?: string
}): Promise<OpsTeamMemberRow> {
  if (!input.name.trim()) throw new Error('name is required')
  const { data, error } = await db()
    .from('ops_team_members')
    .insert({
      name: input.name.trim(),
      email: input.email?.trim() || null,
      role: input.role?.trim() || 'Team member',
      brand_ids: input.brand_ids ?? [],
      active: input.active ?? true,
      phone: input.phone?.trim() ?? '',
      job_title: input.job_title?.trim() ?? '',
      department: input.department?.trim() ?? '',
      start_date: input.start_date || null,
      notes: input.notes ?? '',
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as OpsTeamMemberRow
}

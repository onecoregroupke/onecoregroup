import { cache } from 'react'
import { db } from './serverClient'
import type { OpsTeamMemberRow } from '@ocg/db'

export const listTeam = cache(async function listTeam(): Promise<OpsTeamMemberRow[]> {
  const { data } = await db()
    .from('ops_team_members')
    .select('*')
    .eq('active', true)
    .order('name', { ascending: true })
  return (data as OpsTeamMemberRow[] | null) ?? []
})

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

export async function updateTeamMember(
  id: string,
  input: Partial<{
    name: string
    email: string
    role: string
    brand_ids: string[]
    active: boolean
    phone: string
    job_title: string
    department: string
    start_date: string | null
    notes: string
  }>,
): Promise<OpsTeamMemberRow> {
  if (!id) throw new Error('id is required')
  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.email !== undefined) patch.email = input.email.trim() || null
  if (input.role !== undefined) patch.role = input.role.trim() || 'Team member'
  if (input.brand_ids !== undefined) patch.brand_ids = input.brand_ids
  if (input.active !== undefined) patch.active = input.active
  if (input.phone !== undefined) patch.phone = input.phone.trim()
  if (input.job_title !== undefined) patch.job_title = input.job_title.trim()
  if (input.department !== undefined) patch.department = input.department.trim()
  if (input.start_date !== undefined) patch.start_date = input.start_date || null
  if (input.notes !== undefined) patch.notes = input.notes
  const { data, error } = await db()
    .from('ops_team_members')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as OpsTeamMemberRow
}

/**
 * The ops_team_members row for a signed-in portal user, matched by email
 * (case-insensitive). Returns null when the account has no team-member row —
 * callers MUST treat that as "scoped to nothing" rather than "unscoped", the
 * same rule loadActor() applies to task scoping.
 */
export async function memberForEmail(email: string | null): Promise<OpsTeamMemberRow | null> {
  if (!email) return null
  const lower = email.trim().toLowerCase()
  if (!lower) return null
  const team = await listTeam()
  return team.find((m) => (m.email ?? '').trim().toLowerCase() === lower) ?? null
}

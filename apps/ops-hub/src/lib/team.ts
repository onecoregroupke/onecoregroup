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

import { db } from './serverClient'
import type { Actor } from './api-auth'

type JsonRow = Record<string, unknown>

export function changedFields(before: JsonRow | null, after: JsonRow | null): string[] {
  if (!before || !after) return []
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys].filter((key) => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null))
}

export async function auditEvent(input: {
  actor?: Pick<Actor, 'userId' | 'email' | 'name'> | null
  action: string
  entity_table: string
  entity_id: string
  entity_label?: string
  before_data?: JsonRow | null
  after_data?: JsonRow | null
  undo_event_id?: string | null
}): Promise<void> {
  await db().from('ocg_audit_events').insert({
    actor_user_id: input.actor?.userId ?? null,
    actor_email: input.actor?.email ?? '',
    actor_name: input.actor?.name ?? '',
    action: input.action,
    entity_table: input.entity_table,
    entity_id: input.entity_id,
    entity_label: input.entity_label ?? '',
    before_data: input.before_data ?? null,
    after_data: input.after_data ?? null,
    changed_fields: changedFields(input.before_data ?? null, input.after_data ?? null),
    undo_event_id: input.undo_event_id ?? null,
  })
}

export async function listAuditEvents(
  table: string,
  id: string,
  limit = 50,
): Promise<JsonRow[]> {
  const { data } = await db()
    .from('ocg_audit_events')
    .select('*')
    .eq('entity_table', table)
    .eq('entity_id', id)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data as JsonRow[] | null) ?? []
}

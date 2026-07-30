import { db, nowIso } from './serverClient'
import type { RecordVersionRow } from '@ocg/db'

/**
 * Append-only record-version store (migration 046). Powers undo / restore for
 * eligible records and a full change history alongside `ocg_audit_events`. Every
 * material change snapshots the row AFTER the change (plus the previous row for a
 * quick diff / undo). Posted financial entries are never rewritten — corrections
 * use reversal/adjustment entries — so their versions are an audit trail, not an
 * editable history.
 */
export async function snapshotVersion(input: {
  record_type: string
  record_id: string
  action: RecordVersionRow['action']
  snapshot: Record<string, unknown>
  previous_snapshot?: Record<string, unknown> | null
  brand_id?: string | null
  changed_by?: string
  reason?: string
  import_id?: string | null
}): Promise<void> {
  const supabase = db()
  const { data: last } = await supabase
    .from('record_versions')
    .select('version_no')
    .eq('record_type', input.record_type)
    .eq('record_id', input.record_id)
    .order('version_no', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextVersion = ((last as { version_no: number } | null)?.version_no ?? 0) + 1
  await supabase.from('record_versions').insert({
    record_type: input.record_type,
    record_id: input.record_id,
    version_no: nextVersion,
    action: input.action,
    snapshot: input.snapshot,
    previous_snapshot: input.previous_snapshot ?? null,
    brand_id: input.brand_id ?? null,
    changed_by: input.changed_by ?? '',
    reason: input.reason ?? '',
    import_id: input.import_id ?? null,
    created_at: nowIso(),
  })
}

export async function listVersions(
  recordType: string,
  recordId: string,
  limit = 100,
): Promise<RecordVersionRow[]> {
  const { data } = await db()
    .from('record_versions')
    .select('*')
    .eq('record_type', recordType)
    .eq('record_id', recordId)
    .order('version_no', { ascending: false })
    .limit(limit)
  return (data as RecordVersionRow[] | null) ?? []
}

/** Fetch a specific version's snapshot to restore (caller re-applies + re-snapshots). */
export async function getVersion(id: string): Promise<RecordVersionRow | null> {
  const { data } = await db().from('record_versions').select('*').eq('id', id).maybeSingle()
  return (data as RecordVersionRow | null) ?? null
}

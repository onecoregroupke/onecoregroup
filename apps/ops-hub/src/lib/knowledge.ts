import { db, nowIso } from './serverClient'
import { initialKnowledgeStatus, type KnowledgeSourceClass } from './governanceModel'
import type { KnowledgeEntryRow, KnowledgeVersionRow, RecordAccessLevel } from '@ocg/db'

export interface KnowledgeRecord extends KnowledgeEntryRow {
  versions: KnowledgeVersionRow[]
  currentVersion: KnowledgeVersionRow | null
}

export async function listKnowledge(input: {
  allowedBrands: string[] | null
  recordScope: RecordAccessLevel
  department: string
  ownerMemberId: string | null
}): Promise<KnowledgeRecord[]> {
  let query = db().from('ocg_knowledge_entries').select('*').order('updated_at', { ascending: false }).limit(500)
  if (input.allowedBrands !== null) query = query.in('brand_id', input.allowedBrands)
  if (input.recordScope === 'own') {
    if (!input.ownerMemberId) return []
    query = query.eq('owner_member_id', input.ownerMemberId)
  } else if (input.recordScope === 'department') {
    if (!input.department) return []
    query = query.eq('department', input.department)
  } else if (input.recordScope !== 'group') {
    query = query.in('visibility_scope', ['own', 'department', 'management'])
  }
  const { data } = await query
  const entries = (data as KnowledgeEntryRow[] | null) ?? []
  if (entries.length === 0) return []
  const { data: versionsData } = await db().from('ocg_knowledge_versions').select('*')
    .in('entry_id', entries.map((entry) => entry.id)).order('version_no', { ascending: false })
  const versions = (versionsData as KnowledgeVersionRow[] | null) ?? []
  return entries.map((entry) => {
    const related = versions.filter((version) => version.entry_id === entry.id)
    return {
      ...entry,
      versions: related,
      currentVersion: related.find((version) => version.id === entry.current_version_id) ?? null,
    }
  })
}

export async function createKnowledge(input: {
  title: string
  brand_id: string | null
  department: string
  operational_area: string
  knowledge_type: string
  owner_member_id: string | null
  visibility_scope: KnowledgeEntryRow['visibility_scope']
  tags: string[]
  content_body: string
  file_url?: string
  source_title?: string
  source_type?: string
  source_date?: string | null
  source_reference?: string
  sourceClass: KnowledgeSourceClass
  actor: string
}): Promise<KnowledgeRecord> {
  if (!input.title.trim()) throw new Error('Title is required')
  const supabase = db()
  const { data: entryData, error: entryError } = await supabase.from('ocg_knowledge_entries').insert({
    title: input.title.trim(), brand_id: input.brand_id, department: input.department,
    operational_area: input.operational_area, knowledge_type: input.knowledge_type,
    owner_member_id: input.owner_member_id, visibility_scope: input.visibility_scope,
    tags: input.tags, created_by: input.actor,
  }).select('*').single()
  if (entryError) throw new Error(entryError.message)
  const entry = entryData as KnowledgeEntryRow
  const status = initialKnowledgeStatus(input.sourceClass)
  const { data: versionData, error: versionError } = await supabase.from('ocg_knowledge_versions').insert({
    entry_id: entry.id, version_no: 1, status, content_body: input.content_body,
    file_url: input.file_url ?? '', source_title: input.source_title ?? '',
    source_type: input.source_type ?? input.sourceClass, source_date: input.source_date ?? null,
    source_reference: input.source_reference ?? '', created_by: input.actor,
    change_summary: status === 'legacy' ? 'Registered as legacy/reference knowledge; not active policy.' : 'Initial draft',
  }).select('*').single()
  if (versionError) throw new Error(versionError.message)
  const version = versionData as KnowledgeVersionRow
  return { ...entry, versions: [version], currentVersion: null }
}

export async function createKnowledgeVersion(input: {
  entry: KnowledgeEntryRow
  content_body: string
  file_url?: string
  source_title?: string
  source_type?: string
  source_date?: string | null
  source_reference?: string
  change_summary: string
  actor: string
}): Promise<KnowledgeVersionRow> {
  const { data: last } = await db().from('ocg_knowledge_versions').select('version_no')
    .eq('entry_id', input.entry.id).order('version_no', { ascending: false }).limit(1).maybeSingle()
  const next = Number((last as { version_no: number } | null)?.version_no ?? 0) + 1
  const { data, error } = await db().from('ocg_knowledge_versions').insert({
    entry_id: input.entry.id, version_no: next, status: 'draft', content_body: input.content_body,
    file_url: input.file_url ?? '', source_title: input.source_title ?? '', source_type: input.source_type ?? '',
    source_date: input.source_date ?? null, source_reference: input.source_reference ?? '',
    change_summary: input.change_summary, supersedes_version_id: input.entry.current_version_id,
    created_by: input.actor,
  }).select('*').single()
  if (error) throw new Error(error.message)
  await db().from('ocg_knowledge_entries').update({ updated_at: nowIso() }).eq('id', input.entry.id)
  return data as KnowledgeVersionRow
}

export async function publishKnowledgeVersion(versionId: string, approvedBy: string): Promise<KnowledgeVersionRow> {
  const { data, error } = await db().rpc('publish_knowledge_version', {
    p_version_id: versionId,
    p_approved_by: approvedBy,
  })
  if (error) throw new Error(error.message)
  return data as KnowledgeVersionRow
}

export async function getKnowledgeEntry(id: string): Promise<KnowledgeEntryRow | null> {
  const { data } = await db().from('ocg_knowledge_entries').select('*').eq('id', id).maybeSingle()
  return (data as KnowledgeEntryRow | null) ?? null
}


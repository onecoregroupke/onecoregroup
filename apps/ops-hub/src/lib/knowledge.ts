import { db, nowIso } from './serverClient'
import { hasAuthority, initialKnowledgeStatus, type KnowledgeSourceClass } from './governanceModel'
import type { EmployeeAuthorityRow, KnowledgeEntryRow, KnowledgeVersionRow, RecordAccessLevel } from '@ocg/db'

export interface KnowledgeRecord extends KnowledgeEntryRow {
  versions: KnowledgeVersionRow[]
  currentVersion: KnowledgeVersionRow | null
}

// ─── Library status filtering (§36) ─────────────────────────────────────────

export const KNOWLEDGE_FILTERS = ['active', 'drafts', 'legacy', 'archived'] as const
export type KnowledgeFilter = (typeof KNOWLEDGE_FILTERS)[number]

export const KNOWLEDGE_FILTER_LABELS: Record<KnowledgeFilter, string> = {
  active: 'Active',
  drafts: 'Drafts',
  legacy: 'Legacy / reference',
  archived: 'Archived',
}

export function parseKnowledgeFilter(value: string | null | undefined): KnowledgeFilter {
  const v = (value ?? '').toLowerCase()
  return (KNOWLEDGE_FILTERS as readonly string[]).includes(v) ? (v as KnowledgeFilter) : 'active'
}

/**
 * The status a record presents as: the status of its current version, or of its
 * newest version when nothing has been published yet.
 */
export function recordStatus(record: KnowledgeRecord): string {
  return (record.currentVersion ?? record.versions[0])?.status ?? 'draft'
}

/**
 * §36: the default library shows usable company knowledge, not tombstones.
 *
 * A record whose only versions are archived is history. It stays reachable —
 * deliberately, because archived business history sometimes has to be inspected
 * — but under an explicit Archived view rather than mixed into the working
 * library, where it competes for attention with current policy.
 */
export function matchesKnowledgeFilter(record: KnowledgeRecord, filter: KnowledgeFilter): boolean {
  const statuses = record.versions.map((v) => v.status)
  const archivedOnly = statuses.length > 0 && statuses.every((s) => s === 'archived')

  switch (filter) {
    case 'archived':
      return archivedOnly || statuses.includes('archived')
    case 'drafts':
      return !archivedOnly && recordStatus(record) === 'draft'
    case 'legacy':
      return !archivedOnly && recordStatus(record) === 'legacy'
    case 'active':
      // Everything still in use: published current knowledge, plus drafts and
      // legacy material that has not been archived away.
      return !archivedOnly
  }
}

export function filterKnowledge(records: KnowledgeRecord[], filter: KnowledgeFilter): KnowledgeRecord[] {
  return records.filter((r) => matchesKnowledgeFilter(r, filter))
}

/** How many records each filter would show, for the tab counts. */
export function knowledgeFilterCounts(records: KnowledgeRecord[]): Record<KnowledgeFilter, number> {
  return {
    active: filterKnowledge(records, 'active').length,
    drafts: filterKnowledge(records, 'drafts').length,
    legacy: filterKnowledge(records, 'legacy').length,
    archived: filterKnowledge(records, 'archived').length,
  }
}

/**
 * Entries this reader may see.
 *
 * The database query narrows; `knowledgeEntryInScope` decides. Running the same
 * predicate the detail route uses over the fetched rows is what guarantees §34's
 * "list, detail route and API must agree" — the filter cannot drift from the
 * gate, because it IS the gate.
 */
export async function listKnowledge(input: {
  allowedBrands: string[] | null
  recordScope: RecordAccessLevel
  department: string
  ownerMemberId: string | null
}): Promise<KnowledgeRecord[]> {
  const base = () => {
    let q = db().from('ocg_knowledge_entries').select('*')
      .order('updated_at', { ascending: false }).limit(500)
    if (input.allowedBrands !== null) q = q.in('brand_id', input.allowedBrands)
    return q
  }

  // Narrow in the DATABASE first. These filters can only ever narrow — the
  // predicate below is what decides — but they keep the 500-row limit meaningful
  // per reader instead of spending it on rows they will never be shown.
  const queries: PromiseLike<{ data: unknown }>[] = []
  if (input.recordScope === 'own') {
    if (!input.ownerMemberId) return []
    queries.push(base().eq('owner_member_id', input.ownerMemberId))
  } else if (input.recordScope === 'department') {
    if (!input.department && !input.ownerMemberId) return []
    if (input.department) queries.push(base().eq('department', input.department))
    // A document someone owns stays reachable even if it sits in another
    // department — knowledgeEntryInScope() grants the owner unconditionally, so
    // the query must be able to return it.
    if (input.ownerMemberId) queries.push(base().eq('owner_member_id', input.ownerMemberId))
  } else {
    queries.push(base())
  }

  const results = await Promise.all(queries)
  const byId = new Map<string, KnowledgeEntryRow>()
  for (const result of results) {
    for (const row of ((result.data as KnowledgeEntryRow[] | null) ?? [])) byId.set(row.id, row)
  }

  // The same predicate the detail route runs. The filter cannot drift from the
  // gate, because it IS the gate (§34).
  const entries = [...byId.values()]
    .filter((entry) => knowledgeEntryInScope(entry, {
      allowedBrands: input.allowedBrands,
      recordScope: input.recordScope,
      memberDepartment: input.department || null,
      memberId: input.ownerMemberId,
    }))
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
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

/**
 * A new draft version of an entry.
 *
 * §38, PROVENANCE. Where a document came from — its source title, type, date,
 * reference, file, and its effective/review dates — describes the ORIGIN of the
 * knowledge, not the wording of one revision. Blanking those fields because a
 * revision form did not resend them silently destroys the audit trail: a policy
 * would keep its text and lose the board minute that authorised it.
 *
 * So each field is carried forward from the current version unless the caller
 * explicitly supplies a new value. `content_body` and `change_summary` are the
 * fields genuinely being revised and are never inherited.
 */
export async function createKnowledgeVersion(input: {
  entry: KnowledgeEntryRow
  content_body: string
  file_url?: string
  source_title?: string
  source_type?: string
  source_date?: string | null
  source_reference?: string
  effective_from?: string | null
  review_date?: string | null
  change_summary: string
  actor: string
}): Promise<KnowledgeVersionRow> {
  const { data: last } = await db().from('ocg_knowledge_versions').select('*')
    .eq('entry_id', input.entry.id).order('version_no', { ascending: false }).limit(1).maybeSingle()
  const previous = (last as KnowledgeVersionRow | null) ?? null
  const next = Number(previous?.version_no ?? 0) + 1

  /** Explicit value wins; a blank/absent one inherits rather than erases. */
  const carry = (supplied: string | null | undefined, prior: string | null | undefined): string =>
    (supplied ?? '').trim() ? String(supplied) : (prior ?? '')
  const carryDate = (supplied: string | null | undefined, prior: string | null | undefined): string | null =>
    supplied ? supplied : (prior ?? null)

  const { data, error } = await db().from('ocg_knowledge_versions').insert({
    entry_id: input.entry.id,
    version_no: next,
    status: 'draft',
    content_body: input.content_body,
    file_url: carry(input.file_url, previous?.file_url),
    source_title: carry(input.source_title, previous?.source_title),
    source_type: carry(input.source_type, previous?.source_type),
    source_date: carryDate(input.source_date, previous?.source_date),
    source_reference: carry(input.source_reference, previous?.source_reference),
    effective_from: carryDate(input.effective_from, previous?.effective_from),
    review_date: carryDate(input.review_date, previous?.review_date),
    change_summary: input.change_summary,
    supersedes_version_id: input.entry.current_version_id,
    created_by: input.actor,
  }).select('*').single()
  if (error) throw new Error(error.message)
  await db().from('ocg_knowledge_entries').update({ updated_at: nowIso() }).eq('id', input.entry.id)
  return data as KnowledgeVersionRow
}

export class KnowledgeVersionMismatchError extends Error {
  constructor() {
    super('That version does not belong to this knowledge entry.')
    this.name = 'KnowledgeVersionMismatchError'
  }
}

/** One version row, or null. Used to bind a publish request to its real entry. */
export async function getKnowledgeVersion(versionId: string): Promise<KnowledgeVersionRow | null> {
  if (!versionId) return null
  const { data } = await db().from('ocg_knowledge_versions').select('*').eq('id', versionId).maybeSingle()
  return (data as KnowledgeVersionRow | null) ?? null
}

/**
 * Publish a draft as the entry's current version.
 *
 * §33: the version is resolved SERVER-SIDE and must belong to `entryId`. The
 * previous flow authorised against an entry taken from the request and then
 * published a version id taken from the same request without ever relating the
 * two — so a caller permitted on one entry could pass an unrelated version id
 * and publish a document they had no rights to. The parent entry is now the
 * thing authorisation is performed against, and it comes from the version.
 *
 * `entryId` is still required and still checked: the caller must be right about
 * what they are publishing, not merely be permitted on something.
 */
export async function publishKnowledgeVersion(
  versionId: string,
  approvedBy: string,
  entryId: string,
): Promise<KnowledgeVersionRow> {
  const version = await getKnowledgeVersion(versionId)
  if (!version) throw new Error('Knowledge version not found')
  if (!entryId || version.entry_id !== entryId) throw new KnowledgeVersionMismatchError()

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

/** Full record for the reader page: entry + every version, oldest last. */
export async function getKnowledgeRecord(id: string): Promise<KnowledgeRecord | null> {
  const entry = await getKnowledgeEntry(id)
  if (!entry) return null
  const { data: versionsData } = await db().from('ocg_knowledge_versions').select('*')
    .eq('entry_id', id).order('version_no', { ascending: false })
  const versions = (versionsData as KnowledgeVersionRow[] | null) ?? []
  return { ...entry, versions, currentVersion: versions.find((version) => version.id === entry.current_version_id) ?? null }
}

/**
 * §34: `visibility_scope` ranked. own < department < management < group.
 *
 * A document marked `group` is the MOST restricted, not the most public — it is
 * group-level material, reachable only by someone whose record horizon reaches
 * the whole group. Reading the ladder the other way round is the mistake that
 * turns a confidential board paper into a company-wide handout.
 */
const VISIBILITY_RANK: Record<string, number> = {
  own: 0, department: 1, management: 2, group: 3,
}

const RECORD_SCOPE_RANK: Record<RecordAccessLevel, number> = {
  own: 0, department: 1, management: 2, group: 3,
}

/** Whether a reader's horizon reaches a document's visibility band. */
export function visibilityAllowed(
  visibilityScope: string,
  recordScope: RecordAccessLevel,
): boolean {
  // An unrecognised band is treated as the most restricted, not the least.
  const required = VISIBILITY_RANK[visibilityScope] ?? VISIBILITY_RANK['group']!
  return RECORD_SCOPE_RANK[recordScope] >= required
}

/**
 * The single boundary the list, the detail route and the API all enforce.
 *
 * §34: "List, detail route and API must agree." They previously did not — the
 * list excluded `group`-visibility entries from a management-scope reader while
 * this function returned true for anything a management reader asked for, so a
 * document hidden from the list opened perfectly well by URL. The visibility
 * band is now checked here, which is the one place all three call.
 */
export function knowledgeEntryInScope(entry: KnowledgeEntryRow, opts: {
  allowedBrands: string[] | null
  recordScope: RecordAccessLevel
  memberDepartment: string | null
  memberId: string | null
}): boolean {
  if (opts.allowedBrands !== null && (!entry.brand_id || !opts.allowedBrands.includes(entry.brand_id))) return false

  // §51: visibility_scope is a SECURITY band, and ownership does not bypass it.
  // Being recorded as the owner of a document means stewardship — you are the
  // person responsible for keeping it right — not clearance. A low-scope account
  // named as owner of a management-band document must not be able to read it by
  // virtue of that name; the correct fix for that situation is to raise the
  // person's record horizon, deliberately, not to leak the document.
  if (!visibilityAllowed(entry.visibility_scope, opts.recordScope)) return false

  if (opts.recordScope === 'group' || opts.recordScope === 'management') return true
  if (opts.recordScope === 'department') {
    // Within the band they may reach, a department reader sees their department
    // — and anything they personally own, which is ordinary owner semantics
    // operating INSIDE the visibility they are allowed.
    if (Boolean(opts.memberId) && opts.memberId === entry.owner_member_id) return true
    return Boolean(opts.memberDepartment) && opts.memberDepartment === entry.department
  }
  // 'own' horizon: only what this person owns, and only within its band.
  return Boolean(opts.memberId) && opts.memberId === entry.owner_member_id
}

/**
 * Explicit "approve" authority (never inferred from edit access) is required to
 * publish a draft as current knowledge.
 *
 * §36: a GROUP-level entry — `brand_id IS NULL` — is not a brand document with a
 * blank field; it is company-wide policy. It therefore needs group-level
 * authority, and a brand-specific approval grant does not confer it. Passing the
 * entry's brand id (including null) through to hasAuthority is what makes that
 * distinction, and `requiredScope: 'group'` is what stops an entity-scoped grant
 * reaching it (§35).
 */
export async function canApproveKnowledgeForEntry(input: {
  isFoundingAdmin: boolean
  memberId: string | null
  brandId: string | null
}): Promise<boolean> {
  if (input.isFoundingAdmin) return true
  if (!input.memberId) return false
  const { data } = await db().from('employee_authorities').select('*').eq('member_id', input.memberId).eq('active', true)
  const grants = (data as EmployeeAuthorityRow[] | null) ?? []
  return hasAuthority(grants, 'approve', {
    brandId: input.brandId,
    operationalArea: 'knowledge',
    requiredScope: input.brandId ? 'entity' : 'group',
  })
}

/** Per-record publish rights for a list of entries, resolved in ONE query so the
 *  list can honour the same canPublish decision the reader does (§37). */
export async function canApproveKnowledgeByEntry(
  input: { isFoundingAdmin: boolean; memberId: string | null },
  entries: Pick<KnowledgeEntryRow, 'id' | 'brand_id'>[],
): Promise<Record<string, boolean>> {
  if (entries.length === 0) return {}
  if (input.isFoundingAdmin) return Object.fromEntries(entries.map((e) => [e.id, true]))
  if (!input.memberId) return Object.fromEntries(entries.map((e) => [e.id, false]))

  const { data } = await db().from('employee_authorities').select('*')
    .eq('member_id', input.memberId).eq('active', true)
  const grants = (data as EmployeeAuthorityRow[] | null) ?? []

  return Object.fromEntries(entries.map((e) => [
    e.id,
    hasAuthority(grants, 'approve', {
      brandId: e.brand_id,
      operationalArea: 'knowledge',
      requiredScope: e.brand_id ? 'entity' : 'group',
    }),
  ]))
}


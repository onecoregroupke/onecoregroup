import { db } from '../serverClient'
import { listTeam } from '../team'
import type { DynamicSource } from './model'
import type {
  OcgDailyDutyRow, EmployeeAuthorityRow, OcgFormTemplateRow, OpsTeamMemberRow,
} from '@ocg/db'

// =============================================================================
// The Operating System's live sections (§§33, 54).
//
// The manual is useful BEFORE any of this is populated — the source-backed
// chapters carry it. These sections enrich the manual with what is currently
// recorded, and every one of them must render sensibly when the answer is
// "nothing yet", because that is the state the system is in until the employee
// and duty data is loaded.
//
// Nothing here duplicates people data into Operating System tables. It reads
// the canonical records and displays them.
// =============================================================================

export interface DynamicRow {
  /** Primary label — a person's name, a duty title, an authority action. */
  label: string
  /** Supporting detail shown beside it. */
  detail: string
  /** Optional third column, e.g. a scope or a limit. */
  meta?: string
}

export interface DynamicSection {
  source: DynamicSource
  rows: DynamicRow[]
  /** Shown instead of the rows when there are none. Never a bare blank. */
  emptyMessage: string
}

const EMPTY_MESSAGES: Record<DynamicSource, string> = {
  people:
    'No employees are recorded against this entity yet. This section fills in automatically as the structured employee records are loaded.',
  duties:
    'No recurring duties are configured for this entity yet. Once they are set up in Duty Management they appear here.',
  authorities:
    'No authorities are recorded for this entity yet. Authority is granted explicitly and is never inferred from a role or a capability.',
  forms:
    'No operational forms are configured for this entity yet.',
  systems:
    'No operational modules are recorded as in use for this entity yet.',
}

/**
 * Load every dynamic section a manual asks for, scoped to its entity.
 *
 * `brandId` null means the group manual, which reports across the group.
 * Sections are loaded in one pass rather than per-block, so a manual with five
 * dynamic blocks costs five queries, not five per chapter.
 */
export async function loadDynamicSections(
  sources: DynamicSource[],
  brandId: string | null,
): Promise<Record<string, DynamicSection>> {
  const wanted = [...new Set(sources)]
  const out: Record<string, DynamicSection> = {}

  const loaded = await Promise.all(wanted.map(async (source) => {
    const rows = await loadSource(source, brandId)
    return [source, { source, rows, emptyMessage: EMPTY_MESSAGES[source] }] as const
  }))
  for (const [source, section] of loaded) out[source] = section
  return out
}

async function loadSource(source: DynamicSource, brandId: string | null): Promise<DynamicRow[]> {
  switch (source) {
    case 'people': return loadPeople(brandId)
    case 'duties': return loadDuties(brandId)
    case 'authorities': return loadAuthorities(brandId)
    case 'forms': return loadForms(brandId)
    case 'systems': return loadSystems(brandId)
  }
}

/** Employees assigned to the entity, with role and department. */
async function loadPeople(brandId: string | null): Promise<DynamicRow[]> {
  const team = await listTeam()
  const scoped = brandId
    ? team.filter((m) => (m.brand_ids ?? []).includes(brandId))
    : team
  return scoped.slice(0, 200).map((m: OpsTeamMemberRow) => ({
    label: m.name,
    detail: [m.job_title || m.role, m.department].filter(Boolean).join(' · ') || 'Role not yet recorded',
    meta: (m as { location?: string }).location || '',
  }))
}

/** Active recurring duties targeting the entity. */
async function loadDuties(brandId: string | null): Promise<DynamicRow[]> {
  let q = db().from('ocg_daily_duties').select('*').eq('active', true).limit(200)
  if (brandId) q = q.eq('brand_id', brandId)
  const { data } = await q
  const duties = (data as OcgDailyDutyRow[] | null) ?? []
  return duties.map((d) => ({
    label: d.title,
    detail: [
      d.duty_kind && d.duty_kind !== 'task' ? d.duty_kind : '',
      d.time_of_day ? `due ${d.time_of_day}` : '',
      d.requires_approval ? 'countersigned' : '',
      d.requires_checklist ? 'checklist' : '',
    ].filter(Boolean).join(' · ') || 'Recurring responsibility',
    meta: d.paused ? 'Paused' : '',
  }))
}

/** Who may prepare, review, approve, authorise, post, adjust or reverse. */
async function loadAuthorities(brandId: string | null): Promise<DynamicRow[]> {
  let q = db().from('employee_authorities').select('*').eq('active', true).limit(200)
  if (brandId) q = q.eq('brand_id', brandId)
  const { data } = await q
  const grants = (data as EmployeeAuthorityRow[] | null) ?? []
  if (grants.length === 0) return []

  const team = await listTeam()
  const nameById = new Map(team.map((m) => [m.id, m.name]))
  return grants.map((g) => ({
    label: nameById.get(g.member_id) ?? 'Unknown member',
    detail: [g.authority_action, g.operational_area].filter(Boolean).join(' · '),
    meta: [
      g.authority_scope,
      g.limit_amount_ksh ? `up to KSh ${Number(g.limit_amount_ksh).toLocaleString()}` : '',
    ].filter(Boolean).join(' · '),
  }))
}

/** Operational form templates available to the entity. */
async function loadForms(brandId: string | null): Promise<DynamicRow[]> {
  let q = db().from('ocg_form_templates').select('*').eq('active', true).limit(100)
  if (brandId) q = q.eq('brand_id', brandId)
  const { data } = await q
  const templates = (data as OcgFormTemplateRow[] | null) ?? []
  return templates.map((t) => ({
    label: t.name,
    detail: t.description || 'Operational form',
    meta: '',
  }))
}

/**
 * Which operational modules currently hold records for the entity.
 *
 * Deliberately evidence-based: a module is listed as in use because rows exist,
 * not because the manual claims it. Counts are cheap head queries.
 */
async function loadSystems(brandId: string | null): Promise<DynamicRow[]> {
  const modules: { table: string; label: string; detail: string }[] = [
    { table: 'inventory_items', label: 'Inventory', detail: 'Stock register and movement ledger' },
    { table: 'production_runs', label: 'Manufacturing', detail: 'Production runs and finished-goods transfers' },
    { table: 'purchases', label: 'Procurement', detail: 'Purchases, vendors and receiving' },
    { table: 'finance_journals', label: 'Finance', detail: 'Journals and money movements' },
    { table: 'ocg_daily_duties', label: 'Duties', detail: 'Recurring responsibilities' },
    { table: 'ops_tasks', label: 'Task Board', detail: 'Assigned work' },
  ]

  const counted = await Promise.all(modules.map(async (m) => {
    try {
      let q = db().from(m.table as never).select('*', { count: 'exact', head: true })
      if (brandId) q = (q as unknown as { eq: (c: string, v: string) => typeof q }).eq('brand_id', brandId)
      const { count } = await (q as unknown as Promise<{ count: number | null }>)
      return { ...m, count: count ?? 0 }
    } catch {
      // A module whose table is absent or not brand-scoped simply is not listed,
      // rather than breaking the manual.
      return { ...m, count: 0 }
    }
  }))

  return counted
    .filter((m) => m.count > 0)
    .map((m) => ({
      label: m.label,
      detail: m.detail,
      meta: `${m.count.toLocaleString()} record${m.count === 1 ? '' : 's'}`,
    }))
}

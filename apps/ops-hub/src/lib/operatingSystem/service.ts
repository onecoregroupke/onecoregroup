import { db } from '../serverClient'
import { listBrands } from '../brands'
import type { ManualDocument } from './model'
import { baselineFor } from './manuals'
import type {
  OcgOperatingSystemManualRow, OcgOperatingSystemVersionRow, Brand,
} from '@ocg/db'

// =============================================================================
// Operating System persistence + content resolution.
//
// The DB owns manual IDENTITY and version GOVERNANCE (which version is current,
// what status it carries, when it was generated, who approved it). The chapter
// CONTENT is resolved through one function, so the web reader and the PDF
// renderer cannot end up reading different documents (§7).
// =============================================================================

export interface OperatingSystemManual {
  id: string
  slug: string
  scopeType: string
  brandId: string | null
  brandName: string
  title: string
  summary: string
  sortOrder: number
  version: OcgOperatingSystemVersionRow | null
}

/** Human label for a version status. */
export const MANUAL_STATUS_LABELS: Record<string, string> = {
  working_draft: 'Working draft',
  current: 'Current',
  superseded: 'Superseded',
  archived: 'Archived',
}

export function manualStatusLabel(status: string): string {
  return MANUAL_STATUS_LABELS[status] ?? status
}

/**
 * Resolve a version's chapters.
 *
 * Precedence: structured content stored on the version wins; otherwise the
 * vetted repository baseline named by `content_ref`. This is the ONLY place
 * that decision is made — every renderer goes through it.
 */
export function resolveManualContent(
  version: Pick<OcgOperatingSystemVersionRow, 'content' | 'content_ref'> | null,
): ManualDocument | null {
  if (!version) return null
  const stored = version.content
  if (Array.isArray(stored) && stored.length > 0) {
    // A future authoring surface writes the whole document here.
    const doc = stored as unknown as ManualDocument[]
    if (doc.length === 1 && doc[0]?.chapters) return doc[0]
  }
  return baselineFor(version.content_ref)
}

/** Every manual, newest version each, ordered for the landing page. */
export async function listManuals(): Promise<OperatingSystemManual[]> {
  const [{ data: manualRows }, brands] = await Promise.all([
    db().from('ocg_operating_system_manuals').select('*')
      .eq('active', true).order('sort_order', { ascending: true }),
    listBrands(),
  ])
  const manuals = (manualRows as OcgOperatingSystemManualRow[] | null) ?? []
  if (manuals.length === 0) return []

  const { data: versionRows } = await db().from('ocg_operating_system_versions').select('*')
    .in('manual_id', manuals.map((m) => m.id))
    .order('version_no', { ascending: false })
  const versions = (versionRows as OcgOperatingSystemVersionRow[] | null) ?? []

  return manuals.map((manual) => hydrate(manual, versions, brands))
}

/** One manual by slug, with its current (or latest) version. */
export async function getManual(slug: string): Promise<OperatingSystemManual | null> {
  const { data } = await db().from('ocg_operating_system_manuals').select('*')
    .eq('slug', slug).eq('active', true).maybeSingle()
  const manual = (data as OcgOperatingSystemManualRow | null) ?? null
  if (!manual) return null

  const [{ data: versionRows }, brands] = await Promise.all([
    db().from('ocg_operating_system_versions').select('*')
      .eq('manual_id', manual.id).order('version_no', { ascending: false }),
    listBrands(),
  ])
  return hydrate(manual, (versionRows as OcgOperatingSystemVersionRow[] | null) ?? [], brands)
}

function hydrate(
  manual: OcgOperatingSystemManualRow,
  versions: OcgOperatingSystemVersionRow[],
  brands: Brand[],
): OperatingSystemManual {
  const mine = versions.filter((v) => v.manual_id === manual.id)
  // The nominated current version, else the highest version number.
  const version = mine.find((v) => v.id === manual.current_version_id) ?? mine[0] ?? null
  const brand = manual.brand_id ? brands.find((b) => b.id === manual.brand_id) : undefined
  return {
    id: manual.id,
    slug: manual.slug,
    scopeType: manual.scope_type,
    brandId: manual.brand_id,
    brandName: brand ? (brand.short_name || brand.name) : 'One Core Group',
    title: manual.title,
    summary: manual.summary,
    sortOrder: manual.sort_order,
    version,
  }
}

// ─── Access (§58) ───────────────────────────────────────────────────────────

/**
 * Whether this actor may open a manual.
 *
 * An entity manual describes how that entity operates, which is exactly the
 * information brand scoping exists to compartmentalise: a storekeeper scoped to
 * Iceland has no business reading the college's fee controls. The GROUP manual
 * describes shared operating principles every employee works under, so it stays
 * open to anyone who can reach the Operating System at all.
 *
 * Pure so it can be asserted directly in tests.
 */
export function canOpenManual(
  manual: Pick<OperatingSystemManual, 'scopeType' | 'brandId'>,
  allowedBrandIds: string[] | null,
): boolean {
  if (manual.scopeType === 'group') return true
  if (allowedBrandIds === null) return true // unrestricted
  return !!manual.brandId && allowedBrandIds.includes(manual.brandId)
}

export function visibleManuals(
  manuals: OperatingSystemManual[],
  allowedBrandIds: string[] | null,
): OperatingSystemManual[] {
  return manuals.filter((m) => canOpenManual(m, allowedBrandIds))
}

import { cache } from 'react'
import { db, mintId, nowIso } from './serverClient'
import { resolveBrand } from './brands'
import { getClient } from './clients'
import type { OpsProjectRow } from '@ocg/db'

export const listProjects = cache(async function listProjects(filter?: {
  brandId?: string
  clientId?: string
  status?: string
}): Promise<OpsProjectRow[]> {
  let q = db().from('ops_projects').select('*').order('created_at', { ascending: false })
  if (filter?.brandId) q = q.eq('brand_id', filter.brandId)
  if (filter?.clientId) q = q.eq('client_id', filter.clientId)
  if (filter?.status) q = q.eq('status', filter.status)
  const { data } = await q
  return (data as OpsProjectRow[] | null) ?? []
})

export async function getProject(projectId: string): Promise<OpsProjectRow | null> {
  const { data } = await db()
    .from('ops_projects')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle()
  return (data as OpsProjectRow | null) ?? null
}

export interface CreateProjectInput {
  project_name: string
  /** brand slug or UUID (internal work) */
  brand?: string
  /** CLIENT-XXX (external work) */
  client_id?: string
  /** PROJ-XXX — creates this project as a sub-project; inherits the parent's
   *  brand/client when none is given. Parents must be top-level (one nesting
   *  level: brand → project → sub-project → tasks). */
  parent_project_id?: string
  service_line?: string
  notes?: string
  start_date?: string
}

/** Resolve the local Design System path for a brand slug from the
 *  BRAND_DESIGN_SYSTEM_PATHS env var (JSON map of slug → local path). */
export function brandDesignSystemPath(slug: string | null | undefined): string | null {
  if (!slug) return null
  const raw = process.env['BRAND_DESIGN_SYSTEM_PATHS']
  if (!raw) return null
  try {
    const map = JSON.parse(raw) as Record<string, string>
    return map[slug] ?? null
  } catch {
    return null
  }
}

/** Create a project under a brand and/or an external client. At least one
 *  owner (brand or client) is required by the DB CHECK constraint.
 *  Auto-seeds project context with the brand's local Design System path when known. */
export async function createProject(input: CreateProjectInput): Promise<OpsProjectRow> {
  const supabase = db()
  const name = input.project_name.trim()

  let brandId: string | null = null
  let brandSlug: string | null = null
  let clientName = ''
  let clientId: string | null = input.client_id ?? null

  // Sub-project: inherit the parent's brand/client so the hierarchy always
  // stays inside one brand. Only one nesting level is allowed.
  let parentId: string | null = null
  if (input.parent_project_id) {
    const parent = await getProject(input.parent_project_id)
    if (!parent) throw new Error(`Unknown parent project: ${input.parent_project_id}`)
    if (parent.parent_project_id) {
      throw new Error('Sub-projects cannot have their own sub-projects (max one level).')
    }
    parentId = parent.project_id
    brandId = parent.brand_id
    clientId = clientId ?? parent.client_id
    clientName = parent.client_name
    if (parent.brand_id) {
      const { data: parentBrand } = await supabase.from('brands').select('slug').eq('id', parent.brand_id).maybeSingle()
      brandSlug = (parentBrand as { slug: string } | null)?.slug ?? null
    }
  }

  if (input.brand) {
    const brand = await resolveBrand(input.brand)
    if (!brand) throw new Error(`Unknown brand: ${input.brand}`)
    if (parentId && brandId && brand.id !== brandId) {
      throw new Error('A sub-project must stay in its parent project\'s brand.')
    }
    brandId = brand.id
    brandSlug = brand.slug
    clientName = brand.name
  }
  if (input.client_id) {
    const client = await getClient(input.client_id)
    if (!client) throw new Error(`Unknown client: ${input.client_id}`)
    clientName = client.client_name
  }
  if (!brandId && !clientId) {
    throw new Error('A project must belong to a brand or a client')
  }

  const projectId = await mintId('project')
  const row = {
    project_id: projectId,
    project_name: name,
    brand_id: brandId,
    client_id: clientId,
    client_name: clientName,
    parent_project_id: parentId,
    service_line: input.service_line ?? '',
    status: 'Active',
    start_date: input.start_date ?? '',
    notes: input.notes ?? '',
    folder_status: 'pending',
    updated_at: nowIso(),
  }
  const { data, error } = await supabase.from('ops_projects').insert(row).select('*').single()
  if (error) throw new Error(`createProject failed: ${error.message}`)

  // Auto-seed project context with the brand's local Design System path so any
  // task agent can find brand guidelines without querying Drive.
  const dsPath = brandDesignSystemPath(brandSlug)
  if (dsPath) {
    await setProjectContext(
      projectId,
      `## Code references\nDesign system: ${dsPath}\n`,
      'system',
    ).catch(() => { /* best-effort; project is still created */ })
  }

  return data as OpsProjectRow
}

// ── Project context (the living doc consumed by agent specialists) ──────────
export async function getProjectContext(projectId: string): Promise<string> {
  const { data } = await db()
    .from('ops_project_context')
    .select('content')
    .eq('project_id', projectId)
    .maybeSingle()
  return (data as { content: string } | null)?.content ?? ''
}

export async function setProjectContext(
  projectId: string,
  content: string,
  updatedBy = 'admin',
): Promise<void> {
  const { error } = await db()
    .from('ops_project_context')
    .upsert({ project_id: projectId, content, updated_by: updatedBy, updated_at: nowIso() })
  if (error) throw new Error(`setProjectContext failed: ${error.message}`)
}

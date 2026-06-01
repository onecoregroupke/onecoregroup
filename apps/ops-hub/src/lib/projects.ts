import { db, mintId, nowIso } from './serverClient'
import { resolveBrand } from './brands'
import { getClient } from './clients'
import type { OpsProjectRow } from '@ocg/db'

export async function listProjects(filter?: {
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
}

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
  service_line?: string
  notes?: string
  start_date?: string
}

/** Create a project under a brand and/or an external client. At least one
 *  owner (brand or client) is required by the DB CHECK constraint. */
export async function createProject(input: CreateProjectInput): Promise<OpsProjectRow> {
  const supabase = db()
  const name = input.project_name.trim()

  let brandId: string | null = null
  let clientName = ''
  if (input.brand) {
    const brand = await resolveBrand(input.brand)
    if (!brand) throw new Error(`Unknown brand: ${input.brand}`)
    brandId = brand.id
    clientName = brand.name
  }
  if (input.client_id) {
    const client = await getClient(input.client_id)
    if (!client) throw new Error(`Unknown client: ${input.client_id}`)
    clientName = client.client_name
  }
  if (!brandId && !input.client_id) {
    throw new Error('A project must belong to a brand or a client')
  }

  const projectId = await mintId('project')
  const row = {
    project_id: projectId,
    project_name: name,
    brand_id: brandId,
    client_id: input.client_id ?? null,
    client_name: clientName,
    service_line: input.service_line ?? '',
    status: 'Active',
    start_date: input.start_date ?? '',
    notes: input.notes ?? '',
    folder_status: 'pending',
    updated_at: nowIso(),
  }
  const { data, error } = await supabase.from('ops_projects').insert(row).select('*').single()
  if (error) throw new Error(`createProject failed: ${error.message}`)
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

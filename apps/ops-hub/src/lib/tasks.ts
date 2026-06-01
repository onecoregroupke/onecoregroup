import { db, mintId, nowIso, todayInEat } from './serverClient'
import { resolveBrand } from './brands'
import { getProject } from './projects'
import { completionToken } from './completion'
import { isActiveStatus } from './taskStatuses'
import type { OpsTaskRow } from '@ocg/db'

export interface TaskFilter {
  brandId?: string
  projectId?: string
  clientId?: string
  status?: string
  assignedTo?: string
  agentEligibleOnly?: boolean
  activeOnly?: boolean
  limit?: number
}

export async function listTasks(filter: TaskFilter = {}): Promise<OpsTaskRow[]> {
  let q = db().from('ops_tasks').select('*').order('created_at', { ascending: false })
  if (filter.brandId) q = q.eq('brand_id', filter.brandId)
  if (filter.projectId) q = q.eq('project_id', filter.projectId)
  if (filter.clientId) q = q.eq('client_id', filter.clientId)
  if (filter.status) q = q.eq('current_status', filter.status)
  if (filter.assignedTo) q = q.eq('assigned_to', filter.assignedTo)
  if (filter.agentEligibleOnly) q = q.eq('agent_eligible', 'Yes')
  if (filter.activeOnly) q = q.eq('active', 'Yes')
  if (filter.limit) q = q.limit(filter.limit)
  const { data } = await q
  return (data as OpsTaskRow[] | null) ?? []
}

export async function getTask(taskId: string): Promise<OpsTaskRow | null> {
  const { data } = await db().from('ops_tasks').select('*').eq('task_id', taskId).maybeSingle()
  return (data as OpsTaskRow | null) ?? null
}

/** Tasks assigned to one person, matched by exact name or first-name prefix. */
export async function listTasksForAssignee(name: string): Promise<OpsTaskRow[]> {
  const { data } = await db()
    .from('ops_tasks')
    .select('*')
    .or(`assigned_to.ilike.${name},assigned_to.ilike.${name.split(' ')[0]}%`)
    .order('target_date', { ascending: true })
  return (data as OpsTaskRow[] | null) ?? []
}

export interface CreateTaskInput {
  task_name: string
  project_id: string
  task_description?: string
  assigned_to?: string
  category?: string
  priority?: string
  start_date?: string
  target_date?: string
  notes?: string
  agent_eligible?: 'Yes' | 'No'
  created_by?: string
  /** Where this task originated (e.g. 'marketing_content' + the content row id),
   *  so an approval can return the deliverable to the source. */
  source_kind?: string
  source_ref?: string
}

/** Create a task under a project. Inherits brand + client from the project and
 *  pre-computes the HMAC completion token from (task_id : target_date). */
export async function createTask(input: CreateTaskInput): Promise<OpsTaskRow> {
  const supabase = db()
  const project = await getProject(input.project_id)
  if (!project) throw new Error(`Unknown project: ${input.project_id}`)

  const taskId = await mintId('task')
  const targetDate = input.target_date ?? ''
  const token = completionToken(taskId, targetDate)

  const row = {
    task_id: taskId,
    dropdown_label: `${taskId} — ${input.task_name}`,
    project_id: project.project_id,
    project_name: project.project_name,
    brand_id: project.brand_id,
    client_id: project.client_id ?? '',
    task_name: input.task_name.trim(),
    task_description: input.task_description ?? '',
    assigned_to: input.assigned_to ?? '',
    category: input.category ?? 'Operations',
    priority: input.priority ?? 'Medium',
    start_date: input.start_date ?? todayInEat(),
    target_date: targetDate,
    current_status: 'Not Started',
    last_updated_by: input.created_by ?? 'system',
    last_updated_date: nowIso(),
    latest_work_comment: '',
    active: 'Yes',
    notes: input.notes ?? '',
    hmac_token: token,
    agent_eligible: input.agent_eligible ?? 'Yes',
    source_kind: input.source_kind ?? null,
    source_ref: input.source_ref ?? null,
    updated_at: nowIso(),
  }
  const { data, error } = await supabase.from('ops_tasks').insert(row).select('*').single()
  if (error) throw new Error(`createTask failed: ${error.message}`)
  return data as OpsTaskRow
}

export async function setTaskStatus(
  taskId: string,
  status: string,
  opts: { note?: string; by?: string } = {},
): Promise<OpsTaskRow> {
  const patch: Record<string, unknown> = {
    current_status: status,
    last_updated_by: opts.by ?? 'system',
    last_updated_date: nowIso(),
    updated_at: nowIso(),
    active: isActiveStatus(status) ? 'Yes' : 'No',
  }
  if (opts.note) patch['latest_work_comment'] = opts.note
  const { data, error } = await db()
    .from('ops_tasks')
    .update(patch)
    .eq('task_id', taskId)
    .select('*')
    .single()
  if (error) throw new Error(`setTaskStatus failed: ${error.message}`)
  return data as OpsTaskRow
}

export async function assignTask(
  taskId: string,
  assignedTo: string,
  by = 'admin',
): Promise<OpsTaskRow> {
  const { data, error } = await db()
    .from('ops_tasks')
    .update({
      assigned_to: assignedTo,
      last_updated_by: by,
      last_updated_date: nowIso(),
      updated_at: nowIso(),
    })
    .eq('task_id', taskId)
    .select('*')
    .single()
  if (error) throw new Error(`assignTask failed: ${error.message}`)
  return data as OpsTaskRow
}

export async function updateTaskFields(
  taskId: string,
  fields: Partial<OpsTaskRow>,
): Promise<OpsTaskRow> {
  const patch = { ...fields, updated_at: nowIso() }
  const { data, error } = await db()
    .from('ops_tasks')
    .update(patch)
    .eq('task_id', taskId)
    .select('*')
    .single()
  if (error) throw new Error(`updateTaskFields failed: ${error.message}`)
  return data as OpsTaskRow
}

/** brand slug/uuid → brand_id helper for filters coming from the URL. */
export async function brandIdFromParam(param?: string | null): Promise<string | undefined> {
  if (!param) return undefined
  const brand = await resolveBrand(param)
  return brand?.id
}

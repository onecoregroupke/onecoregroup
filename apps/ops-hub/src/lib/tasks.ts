import { db, mintId, nowIso, todayInEat } from './serverClient'
import { resolveBrand } from './brands'
import { getProject } from './projects'
import { completionToken } from './completion'
import { isActiveStatus } from './taskStatuses'
import type { OpsTaskRow, OpsTaskCommentRow } from '@ocg/db'

export interface TaskFilter {
  brandId?: string
  /** Restrict to these brand ids (brand-manager scope). Applied on top of brandId. */
  brandIds?: string[]
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
  if (filter.brandIds) q = q.in('brand_id', filter.brandIds)
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

/** Tasks assigned to exactly one person (case-insensitive exact name match).
 *  Exact match (not first-name prefix) so two people who share a first name
 *  never see each other's tasks, and avoids PostgREST filter injection. */
export async function listTasksForAssignee(name: string): Promise<OpsTaskRow[]> {
  if (!name.trim()) return []
  const { data } = await db()
    .from('ops_tasks')
    .select('*')
    .ilike('assigned_to', name.trim())
    .order('target_date', { ascending: true })
  return (data as OpsTaskRow[] | null) ?? []
}

/** Whether a task is assigned to the given person (case-insensitive exact). */
export function isTaskAssignee(task: Pick<OpsTaskRow, 'assigned_to'>, name: string): boolean {
  if (!name?.trim() || !task.assigned_to?.trim()) return false
  return task.assigned_to.trim().toLowerCase() === name.trim().toLowerCase()
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
  // Capture the status-change note as a comment so it shows in the thread + report.
  if (opts.note?.trim()) {
    await db().from('ops_task_comments').insert({
      task_id: taskId,
      body: opts.note.trim(),
      author: opts.by ?? '',
      kind: 'status',
      status_at: status,
    })
  }
  return data as OpsTaskRow
}

/** Add a progress comment to a task WITHOUT changing its status. Used by team
 *  members from their portal to log ongoing work; surfaced in the daily report. */
export async function addTaskComment(
  taskId: string,
  body: string,
  opts: { author?: string; kind?: string } = {},
): Promise<OpsTaskCommentRow> {
  const text = body.trim()
  if (!text) throw new Error('Comment body is required')
  const supabase = db()
  const task = await getTask(taskId)
  const { data, error } = await supabase
    .from('ops_task_comments')
    .insert({
      task_id: taskId,
      body: text,
      author: opts.author ?? '',
      kind: opts.kind ?? 'progress',
      status_at: task?.current_status ?? '',
    })
    .select('*')
    .single()
  if (error) throw new Error(`addTaskComment failed: ${error.message}`)
  // Mirror into latest_work_comment for quick display + bump the activity stamp.
  await supabase
    .from('ops_tasks')
    .update({
      latest_work_comment: text,
      last_updated_by: opts.author ?? 'portal',
      last_updated_date: nowIso(),
      updated_at: nowIso(),
    })
    .eq('task_id', taskId)
  return data as OpsTaskCommentRow
}

export async function listTaskComments(taskId: string): Promise<OpsTaskCommentRow[]> {
  const { data } = await db()
    .from('ops_task_comments')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })
  return (data as OpsTaskCommentRow[] | null) ?? []
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

import crypto from 'node:crypto'
import { db, nowIso } from '@/lib/serverClient'
import { getTask, setTaskStatus } from '@/lib/tasks'
import { getProject, getProjectContext } from '@/lib/projects'
import { resolveBrand } from '@/lib/brands'
import { uploadArtifact, storageConfigured } from '@/lib/storage'
import { deliverDoc, driveConfigured } from '@/lib/drive'
import { runInternalSpecialist } from './groq'
import { SPECIALIST_PROFILES, type AgentTaskType } from './specialistRegistry'
import type { OpsAgentArtifactRow, OpsAgentJobRow } from '@ocg/db'

function newRunId(): string {
  return `run_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
}

/** Persist an artifact and (best-effort) deliver it to Drive, then advance the
 *  task to AI Draft Ready. Shared by the UI orchestrator and the CLI. */
export async function submitArtifact(opts: {
  taskId: string
  specialist: AgentTaskType
  title: string
  content: string
  summary?: string
  runId?: string
  jobId?: string | null
  deliver?: boolean
}): Promise<{ artifact: OpsAgentArtifactRow; delivery?: Record<string, unknown>; deliveryNote?: string }> {
  const supabase = db()
  const task = await getTask(opts.taskId)
  if (!task) throw new Error(`Unknown task: ${opts.taskId}`)
  const profile = SPECIALIST_PROFILES[opts.specialist]
  const runId = opts.runId ?? newRunId()

  let delivery: Record<string, unknown> | undefined
  let deliveryNote: string | undefined
  if (opts.deliver !== false) {
    const brand = task.brand_id ? await resolveBrand(task.brand_id) : null
    // 1) Prefer Drive — produces a sharable Google Doc owned by the connected account.
    if (driveConfigured()) {
      try {
        const project = await getProject(task.project_id)
        const owner = brand?.name || task.client_id || project?.client_name || 'Unsorted'
        const res = await deliverDoc({
          ownerFolderName: owner,
          projectId: task.project_id,
          projectName: task.project_name,
          projectFolderId: project?.drive_folder_id ?? null,
          docTitle: opts.title,
          markdown: opts.content,
        })
        delivery = { kind: 'drive', ...res }
        if (project && !project.drive_folder_id) {
          await supabase
            .from('ops_projects')
            .update({ drive_folder_id: res.folder_id, folder_status: 'done', updated_at: nowIso() })
            .eq('project_id', task.project_id)
        }
      } catch (e) {
        deliveryNote = `Drive delivery failed (${(e as Error).message}); falling back to storage.`
      }
    }
    // 2) Fallback — Supabase Storage (private bucket + signed URL).
    if (!delivery && storageConfigured()) {
      try {
        const ownerSlug = brand?.slug || task.client_id || 'unsorted'
        const res = await uploadArtifact({
          ownerSlug,
          projectId: task.project_id,
          title: opts.title,
          markdown: opts.content,
        })
        delivery = res as unknown as Record<string, unknown>
        if (deliveryNote) deliveryNote += ' Saved to storage.'
      } catch (e) {
        deliveryNote = `${deliveryNote ? deliveryNote + ' ' : ''}Storage delivery failed: ${(e as Error).message}. Draft saved in-app.`
      }
    } else if (!delivery && !deliveryNote) {
      deliveryNote = 'No Drive/storage configured — draft saved in-app only.'
    }
  }

  const { data, error } = await supabase
    .from('ops_agent_artifacts')
    .insert({
      run_id: runId,
      job_id: opts.jobId ?? null,
      task_id: opts.taskId,
      artifact_type: profile.outputTypes[0] ?? 'draft',
      title: opts.title,
      content: opts.content,
      url: (delivery?.['web_view_link'] as string) ?? null,
      delivery: delivery ?? null,
      metadata: { specialist: opts.specialist, summary: opts.summary ?? '' },
    })
    .select('*')
    .single()
  if (error) throw new Error(`submitArtifact failed: ${error.message}`)

  await setTaskStatus(opts.taskId, 'AI Draft Ready', {
    note: opts.summary || `Draft delivered: ${opts.title}`,
    by: profile.name,
  })

  return { artifact: data as OpsAgentArtifactRow, delivery, deliveryNote }
}

/** Run a specialist against a task. Internal runtime executes inline via Groq
 *  and delivers immediately; hermes runtime queues a job for a worker to pick up. */
export async function runSpecialistForTask(
  taskId: string,
  specialist: AgentTaskType,
  startedBy = 'system',
): Promise<{ job: OpsAgentJobRow; artifactId?: string; note?: string }> {
  const supabase = db()
  const task = await getTask(taskId)
  if (!task) throw new Error(`Unknown task: ${taskId}`)
  const profile = SPECIALIST_PROFILES[specialist]
  const runId = newRunId()

  await supabase.from('ops_agent_runs').insert({
    id: runId,
    mode: 'single',
    requested_agent_type: specialist,
    brand_id: task.brand_id,
    project_id: task.project_id,
    task_ids: [taskId],
    started_by: startedBy,
  })

  const baseJob = {
    run_id: runId,
    task_id: taskId,
    task_name: task.task_name,
    task_type: specialist,
    brand_id: task.brand_id,
    project_id: task.project_id,
    client_id: task.client_id || null,
    runtime: profile.runtime,
    approval_required: true,
  }

  if (profile.runtime === 'none') {
    const { data } = await supabase
      .from('ops_agent_jobs')
      .insert({ ...baseJob, status: 'skipped', output: 'Manual specialist — needs a human.' })
      .select('*')
      .single()
    return { job: data as OpsAgentJobRow, note: 'This specialist is manual-only.' }
  }

  if (profile.runtime === 'hermes') {
    const { data } = await supabase
      .from('ops_agent_jobs')
      .insert({ ...baseJob, status: 'pending' })
      .select('*')
      .single()
    await setTaskStatus(taskId, 'Ongoing', { note: `Queued ${profile.name}`, by: 'orchestrator' })
    return {
      job: data as OpsAgentJobRow,
      note: 'Queued for the Hermes runtime. A worker or the oc-ops agent will draft and submit it.',
    }
  }

  // internal runtime → run inline with Groq
  const { data: jobData } = await supabase
    .from('ops_agent_jobs')
    .insert({ ...baseJob, status: 'running', started_at: nowIso() })
    .select('*')
    .single()
  const job = jobData as OpsAgentJobRow

  try {
    const projectContext = await getProjectContext(task.project_id)
    const brand = task.brand_id ? await resolveBrand(task.brand_id) : null
    const content = await runInternalSpecialist(specialist, {
      taskName: task.task_name,
      taskDescription: task.task_description,
      projectName: task.project_name,
      brandName: brand?.name,
      projectContext,
      priority: task.priority,
    })
    const title = `${profile.name} — ${task.task_name}`
    const { artifact, deliveryNote } = await submitArtifact({
      taskId,
      specialist,
      title,
      content,
      runId,
      jobId: job.id,
      summary: `Drafted by ${profile.name}`,
    })

    await supabase
      .from('ops_agent_jobs')
      .update({
        status: 'draft_ready',
        output: content.slice(0, 4000),
        delivery_status: artifact.delivery ? 'delivered' : 'draft_only',
        completed_at: nowIso(),
      })
      .eq('id', job.id)

    return { job, artifactId: artifact.id, note: deliveryNote }
  } catch (e) {
    await supabase
      .from('ops_agent_jobs')
      .update({ status: 'error', error_message: (e as Error).message, failed_at: nowIso() })
      .eq('id', job.id)
    throw e
  }
}

export async function approveArtifact(
  artifactId: string,
  opts: { status?: string; note?: string; by?: string } = {},
): Promise<{ taskId: string; status: string }> {
  const supabase = db()
  const { data: artifact } = await supabase
    .from('ops_agent_artifacts')
    .select('*')
    .eq('id', artifactId)
    .maybeSingle()
  if (!artifact) throw new Error(`Unknown artifact: ${artifactId}`)
  const a = artifact as OpsAgentArtifactRow
  const status = opts.status ?? 'Approved'
  await setTaskStatus(a.task_id, status, {
    note: opts.note ?? `Approved draft: ${a.title}`,
    by: opts.by ?? 'admin',
  })
  return { taskId: a.task_id, status }
}

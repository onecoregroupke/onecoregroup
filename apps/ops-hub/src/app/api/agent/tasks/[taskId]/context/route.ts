import { NextResponse, type NextRequest } from 'next/server'
import { verifyAgentKey } from '@/lib/api-auth'
import { getTask } from '@/lib/tasks'
import { getProject, getProjectContext } from '@/lib/projects'
import { resolveBrand } from '@/lib/brands'
import { db } from '@/lib/serverClient'
import type { OpsAgentContextSourceRow } from '@ocg/db'

// Full Hermes-shaped context payload for a task, so an agent can draft offline.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  if (!verifyAgentKey(req)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  const { taskId } = await params
  const task = await getTask(taskId)
  if (!task) return NextResponse.json({ ok: false, error: 'task_not_found' }, { status: 404 })

  const [project, brand, projectContext, sourcesRes] = await Promise.all([
    getProject(task.project_id),
    task.brand_id ? resolveBrand(task.brand_id) : Promise.resolve(null),
    getProjectContext(task.project_id),
    db()
      .from('ops_agent_context_sources')
      .select('*')
      .or(`task_id.eq.${taskId},project_id.eq.${task.project_id}`)
      .eq('include_in_agent', true),
  ])
  const sources = (sourcesRes.data as OpsAgentContextSourceRow[] | null) ?? []

  return NextResponse.json({
    ok: true,
    payload: {
      task: {
        task_id: task.task_id,
        task_name: task.task_name,
        task_description: task.task_description,
        category: task.category,
        priority: task.priority,
        target_date: task.target_date,
        status: task.current_status,
        assigned_to: task.assigned_to,
        agent_eligible: task.agent_eligible,
      },
      brand: brand ? { id: brand.id, slug: brand.slug, name: brand.name } : null,
      project: {
        project_id: task.project_id,
        project_name: task.project_name,
        service_line: project?.service_line ?? '',
        context_summary: projectContext,
        drive_folder_id: project?.drive_folder_id ?? null,
      },
      context_sources: sources.map((s) => ({
        title: s.title,
        type: s.source_type,
        url: s.url,
        notes: s.notes,
      })),
    },
  })
}

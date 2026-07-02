import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { listTasks, createTask, brandIdFromParam } from '@/lib/tasks'
import { listTeam, lookupAssigneeEmail } from '@/lib/team'
import { resolveBrand } from '@/lib/brands'
import { sendTaskAssignment } from '@/lib/email'
import { completionUrl } from '@/lib/completion'

export async function GET(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const brandId = await brandIdFromParam(url.searchParams.get('brand'))
  // Non-super-admins are scoped to their own assigned tasks; the `assignee`
  // query param is only honoured for users who may see all tasks.
  const assignedTo = actor.isSuperAdmin
    ? (url.searchParams.get('assignee') ?? undefined)
    : actor.name
  const tasks = await listTasks({
    brandId,
    projectId: url.searchParams.get('project') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    assignedTo,
    activeOnly: url.searchParams.get('active') === '1',
    limit: url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined,
  })
  return NextResponse.json({ ok: true, tasks })
}

export async function POST(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  // Creating/assigning tasks is an editor action.
  if (!actor.can('ops', 'edit') && !actor.isSuperAdmin) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }
  try {
    const body = await req.json()
    if (!body?.task_name || !body?.project_id) {
      return NextResponse.json(
        { ok: false, error: 'task_name and project_id are required' },
        { status: 400 },
      )
    }
    const task = await createTask({ ...body, created_by: actor.email ?? 'admin' })

    // Best-effort assignment email (never blocks task creation).
    let emailNote: string | undefined
    if (task.assigned_to) {
      const team = await listTeam()
      const to = lookupAssigneeEmail(team, task.assigned_to)
      if (to && task.hmac_token) {
        const brand = task.brand_id ? await resolveBrand(task.brand_id) : null
        const sent = await sendTaskAssignment({
          to,
          taskId: task.task_id,
          taskName: task.task_name,
          projectName: task.project_name,
          brandName: brand?.name,
          priority: task.priority,
          targetDate: task.target_date,
          description: task.task_description,
          completionUrl: completionUrl(task.task_id, task.hmac_token),
        })
        if (!sent) emailNote = 'Assignment email not sent (RESEND_API_KEY missing or send failed).'
      } else if (!to) {
        emailNote = `No email found for "${task.assigned_to}" in the team list — task created without notification.`
      }
    }

    return NextResponse.json({ ok: true, task, emailNote }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}

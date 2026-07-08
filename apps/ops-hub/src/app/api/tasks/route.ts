import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { listTasks, createTask, brandIdFromParam } from '@/lib/tasks'
import { getProject } from '@/lib/projects'
import { listTeam, lookupAssigneeEmail } from '@/lib/team'
import { resolveBrand } from '@/lib/brands'
import { sendTaskAssignment } from '@/lib/email'
import { completionUrl } from '@/lib/completion'
import { auditEvent } from '@/lib/audit'
import { createNotification } from '@/lib/notifications'
import { sendMessage, startConversation } from '@/lib/chat'

export async function GET(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const brandId = await brandIdFromParam(url.searchParams.get('brand'))
  // Scope: 'own' users only see their assigned tasks; brand managers see all
  // tasks within their brands; the `assignee` param is honoured otherwise.
  const scope = actor.taskScope
  const assignedTo = scope.kind === 'own'
    ? actor.name
    : (url.searchParams.get('assignee') ?? undefined)
  const tasks = await listTasks({
    brandId,
    brandIds: scope.kind === 'brands' ? scope.brandIds : undefined,
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
    // Brand managers may only create tasks under their own brands' projects.
    if (actor.taskScope.kind === 'brands') {
      const project = await getProject(body.project_id)
      if (!project || !project.brand_id || !actor.taskScope.brandIds.includes(project.brand_id)) {
        return NextResponse.json(
          { ok: false, error: 'You can only create tasks within your own brand.' },
          { status: 403 },
        )
      }
    }
    const task = await createTask({ ...body, created_by: actor.email ?? 'admin' })
    await auditEvent({
      actor,
      action: 'create',
      entity_table: 'ops_tasks',
      entity_id: task.task_id,
      entity_label: task.task_name,
      after_data: task as unknown as Record<string, unknown>,
    })

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
        await createNotification({
          recipient_email: to,
          recipient_name: task.assigned_to,
          sender_email: actor.email ?? '',
          sender_name: actor.name,
          kind: 'task_assignment',
          title: `New task: ${task.task_name}`,
          body: `${actor.name} assigned ${task.task_id}${task.target_date ? ` due ${task.target_date}` : ''}.`,
          href: `/tasks/${task.task_id}`,
          metadata: { task_id: task.task_id, project_id: task.project_id },
        })
        try {
          const conversation = await startConversation({
            creator_email: actor.email ?? 'admin@onecoregroup.com',
            creator_name: actor.name,
            member_emails: [{ email: to, name: task.assigned_to }],
          })
          await sendMessage({
            conversation_id: conversation.id,
            sender_email: actor.email ?? 'admin@onecoregroup.com',
            sender_name: actor.name,
            body: `New task assigned: ${task.task_name}\n\n${task.task_id} · ${task.project_name} · ${task.priority} priority${task.target_date ? ` · due ${task.target_date}` : ''}\n\n${task.task_description || task.notes || ''}\n\nOpen: ${process.env['NEXT_PUBLIC_OPS_URL'] ?? ''}/tasks/${task.task_id}`,
          })
        } catch {
          // Chat notification is best-effort; task creation/email should still succeed.
        }
      } else if (!to) {
        emailNote = `No email found for "${task.assigned_to}" in the team list — task created without notification.`
      }
    }

    return NextResponse.json({ ok: true, task, emailNote }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}

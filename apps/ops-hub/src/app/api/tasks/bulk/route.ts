import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { getTask, setTaskStatus, updateTaskFields } from '@/lib/tasks'
import { listTeam, lookupAssigneeEmail } from '@/lib/team'
import { resolveBrand } from '@/lib/brands'
import { sendTaskAssignment } from '@/lib/email'
import { completionUrl } from '@/lib/completion'
import { TASK_STATUSES } from '@/lib/taskStatuses'

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const taskIds = Array.isArray(body?.taskIds) ? body.taskIds.filter(Boolean) as string[] : []
    const assignedTo = typeof body?.assigned_to === 'string' ? body.assigned_to.trim() : ''
    const status = typeof body?.status === 'string' ? body.status.trim() : ''

    if (taskIds.length === 0) return NextResponse.json({ ok: false, error: 'taskIds are required' }, { status: 400 })
    if (!assignedTo && !status) return NextResponse.json({ ok: false, error: 'assigned_to or status is required' }, { status: 400 })
    if (status && !(TASK_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ ok: false, error: `status must be one of: ${TASK_STATUSES.join(', ')}` }, { status: 400 })
    }

    const team = assignedTo ? await listTeam() : []
    const emailNotes: string[] = []
    let updated = 0

    for (const taskId of taskIds) {
      const before = await getTask(taskId)
      if (!before) continue

      let task = before
      if (assignedTo) {
        task = await updateTaskFields(taskId, {
          assigned_to: assignedTo,
          last_updated_by: user.email ?? 'admin',
          last_updated_date: new Date().toISOString(),
        })
        const to = lookupAssigneeEmail(team, assignedTo)
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
          if (!sent) emailNotes.push(`Email not sent for ${task.task_id}.`)
        } else if (!to) {
          emailNotes.push(`No email for ${assignedTo}.`)
        }
      }

      if (status) {
        task = await setTaskStatus(taskId, status, {
          by: user.email ?? 'admin',
          note: assignedTo ? `Bulk updated. Assigned to ${assignedTo}.` : 'Bulk status update.',
        })
      }
      updated += task ? 1 : 0
    }

    return NextResponse.json({ ok: true, updated, emailNotes: Array.from(new Set(emailNotes)).slice(0, 5) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}

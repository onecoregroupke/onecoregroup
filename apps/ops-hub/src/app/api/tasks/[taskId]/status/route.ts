import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { getTask, setTaskStatus, isTaskAssignee } from '@/lib/tasks'
import { TASK_STATUSES } from '@/lib/taskStatuses'
import { notifyMarketingOnApproval } from '@/lib/marketingSync'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const { taskId } = await params
  try {
    const body = await req.json()
    const status = body?.status as string
    if (!status || !(TASK_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json(
        { ok: false, error: `status must be one of: ${TASK_STATUSES.join(', ')}` },
        { status: 400 },
      )
    }
    // Editors/super-admins may update any task; everyone else only their own.
    const task0 = await getTask(taskId)
    if (!task0) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    if (!actor.isSuperAdmin && !actor.can('ops', 'edit') && !isTaskAssignee(task0, actor.name)) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }
    const task = await setTaskStatus(taskId, status, {
      note: body?.note,
      by: actor.email ?? 'admin',
    })
    if (status === 'Approved') await notifyMarketingOnApproval(taskId)
    return NextResponse.json({ ok: true, task })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}

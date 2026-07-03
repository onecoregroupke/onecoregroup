import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { addTaskComment, getTask, isTaskAssignee } from '@/lib/tasks'
import { auditEvent } from '@/lib/audit'

// Progress comments (no status change) feed the end-of-day report. The task's
// assignee can log progress on their own task; editors/super-admins on any task.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const { taskId } = await params
  try {
    const body = await req.json()
    const text = (body?.body as string) ?? ''
    if (!text.trim()) return NextResponse.json({ ok: false, error: 'Comment body is required' }, { status: 400 })
    const task = await getTask(taskId)
    if (!task) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    if (!actor.isSuperAdmin && !actor.can('ops', 'edit') && !isTaskAssignee(task, actor.name)) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }
    const comment = await addTaskComment(taskId, text, { author: actor.email ?? 'team' })
    await auditEvent({
      actor,
      action: 'comment',
      entity_table: 'ops_tasks',
      entity_id: taskId,
      entity_label: task.task_name,
      before_data: task as unknown as Record<string, unknown>,
      after_data: { comment_id: comment.id, body: comment.body, kind: comment.kind },
    })
    return NextResponse.json({ ok: true, comment })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}

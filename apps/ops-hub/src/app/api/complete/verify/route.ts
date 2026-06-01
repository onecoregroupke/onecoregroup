import { NextResponse, type NextRequest } from 'next/server'
import { getTask } from '@/lib/tasks'
import { verifyCompletionToken } from '@/lib/completion'

// Public, token-gated. Confirms a completion link is valid + returns the task.
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const taskId = url.searchParams.get('task') ?? ''
  const token = url.searchParams.get('token') ?? ''
  if (!taskId || !token) {
    return NextResponse.json({ ok: false, error: 'missing task or token' }, { status: 400 })
  }
  const task = await getTask(taskId)
  if (!task) return NextResponse.json({ ok: false, error: 'task_not_found' }, { status: 404 })

  const result = verifyCompletionToken(taskId, task.target_date, token)
  if (!result.valid) {
    return NextResponse.json({ ok: false, error: result.reason }, { status: 403 })
  }
  return NextResponse.json({
    ok: true,
    task: {
      task_id: task.task_id,
      task_name: task.task_name,
      project_name: task.project_name,
      priority: task.priority,
      target_date: task.target_date,
      current_status: task.current_status,
      assigned_to: task.assigned_to,
    },
  })
}

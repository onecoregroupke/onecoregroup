import { NextResponse, type NextRequest } from 'next/server'
import { getTask, setTaskStatus } from '@/lib/tasks'
import { verifyCompletionToken, recordCompletion } from '@/lib/completion'
import { todayInEat } from '@/lib/serverClient'

// Public, token-gated. Records a completion submission and advances the task.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const taskId = body?.task as string
    const token = body?.token as string
    if (!taskId || !token) {
      return NextResponse.json({ ok: false, error: 'missing task or token' }, { status: 400 })
    }
    const task = await getTask(taskId)
    if (!task) return NextResponse.json({ ok: false, error: 'task_not_found' }, { status: 404 })

    const result = verifyCompletionToken(taskId, task.target_date, token)
    if (!result.valid) {
      return NextResponse.json({ ok: false, error: result.reason }, { status: 403 })
    }

    const status = (body?.status as string) || 'Completed'
    const record = await recordCompletion({
      task_id: taskId,
      completion_date: body?.completion_date || todayInEat(),
      status,
      summary: body?.summary,
      outcome: body?.outcome,
      blockers_notes: body?.blockers_notes,
      file_urls: Array.isArray(body?.file_urls) ? body.file_urls : [],
      submitted_by: body?.submitted_by || task.assigned_to,
    })

    // Advance the source-of-truth task.
    await setTaskStatus(taskId, status, {
      note: body?.summary || 'Completion submitted via link',
      by: body?.submitted_by || task.assigned_to || 'assignee',
    })

    return NextResponse.json({ ok: true, record })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}

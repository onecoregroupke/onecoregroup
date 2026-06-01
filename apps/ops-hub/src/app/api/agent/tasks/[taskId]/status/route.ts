import { NextResponse, type NextRequest } from 'next/server'
import { verifyAgentKey } from '@/lib/api-auth'
import { setTaskStatus } from '@/lib/tasks'
import { TASK_STATUSES } from '@/lib/taskStatuses'
import { notifyMarketingOnApproval } from '@/lib/marketingSync'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  if (!verifyAgentKey(req)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
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
    const task = await setTaskStatus(taskId, status, { note: body?.note, by: body?.by ?? 'agent' })
    if (status === 'Approved') await notifyMarketingOnApproval(taskId)
    return NextResponse.json({ ok: true, task_id: task.task_id, status: task.current_status })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}

import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { setTaskStatus } from '@/lib/tasks'
import { TASK_STATUSES } from '@/lib/taskStatuses'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
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
    const task = await setTaskStatus(taskId, status, {
      note: body?.note,
      by: user.email ?? 'admin',
    })
    return NextResponse.json({ ok: true, task })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}

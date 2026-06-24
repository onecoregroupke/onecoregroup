import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { addTaskComment } from '@/lib/tasks'

// Any signed-in user (including portal team members) can log a progress comment
// on a task. No status change — this feeds the end-of-day report.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const { taskId } = await params
  try {
    const body = await req.json()
    const text = (body?.body as string) ?? ''
    if (!text.trim()) return NextResponse.json({ ok: false, error: 'Comment body is required' }, { status: 400 })
    const comment = await addTaskComment(taskId, text, { author: user.email ?? 'team' })
    return NextResponse.json({ ok: true, comment })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}

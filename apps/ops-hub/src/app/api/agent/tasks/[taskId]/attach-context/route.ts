import { NextResponse, type NextRequest } from 'next/server'
import { verifyAgentKey } from '@/lib/api-auth'
import { getTask } from '@/lib/tasks'
import { db, nowIso } from '@/lib/serverClient'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  if (!verifyAgentKey(req)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  const { taskId } = await params
  try {
    const body = await req.json()
    if (!body?.title) return NextResponse.json({ ok: false, error: 'title is required' }, { status: 400 })
    const task = await getTask(taskId)
    if (!task) return NextResponse.json({ ok: false, error: 'task_not_found' }, { status: 404 })

    const { data, error } = await db()
      .from('ops_agent_context_sources')
      .insert({
        scope_type: 'task',
        task_id: taskId,
        project_id: task.project_id,
        brand_id: task.brand_id,
        title: body.title,
        source_type: body.type ?? 'note',
        url: body.url ?? null,
        notes: body.notes ?? null,
        created_by: body.by ?? 'agent',
        updated_at: nowIso(),
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, id: (data as { id: string }).id }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}

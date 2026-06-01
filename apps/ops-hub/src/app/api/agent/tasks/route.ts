import { NextResponse, type NextRequest } from 'next/server'
import { verifyAgentKey } from '@/lib/api-auth'
import { createTask } from '@/lib/tasks'

export async function POST(req: NextRequest) {
  if (!verifyAgentKey(req)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  try {
    const body = await req.json()
    if (!body?.task_name || !body?.project_id) {
      return NextResponse.json({ ok: false, error: 'task_name and project_id are required' }, { status: 400 })
    }
    const task = await createTask({ ...body, created_by: 'agent' })
    return NextResponse.json({ ok: true, task_id: task.task_id, task }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}

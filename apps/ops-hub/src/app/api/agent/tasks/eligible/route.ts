import { NextResponse, type NextRequest } from 'next/server'
import { verifyAgentKey } from '@/lib/api-auth'
import { listTasks, brandIdFromParam } from '@/lib/tasks'

export async function GET(req: NextRequest) {
  if (!verifyAgentKey(req)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  const url = new URL(req.url)
  const brandId = await brandIdFromParam(url.searchParams.get('brand'))
  const tasks = await listTasks({
    brandId,
    projectId: url.searchParams.get('project') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    agentEligibleOnly: true,
    activeOnly: true,
    limit: url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : 50,
  })
  return NextResponse.json({
    ok: true,
    tasks: tasks.map((t) => ({
      task_id: t.task_id,
      task_name: t.task_name,
      brand_id: t.brand_id,
      project_id: t.project_id,
      project_name: t.project_name,
      assigned_to: t.assigned_to,
      priority: t.priority,
      status: t.current_status,
      target_date: t.target_date,
    })),
  })
}

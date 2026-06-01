import { NextResponse, type NextRequest } from 'next/server'
import { allowAgentOrUser } from '@/lib/api-auth'
import { runSpecialistForTask } from '@/lib/agents/orchestrator'
import { isSpecialist } from '@/lib/agents/specialistRegistry'

export async function POST(req: NextRequest) {
  const actor = await allowAgentOrUser(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const taskId = body?.taskId as string
    const specialist = body?.specialist as string
    if (!taskId || !specialist || !isSpecialist(specialist)) {
      return NextResponse.json({ ok: false, error: 'taskId and a valid specialist are required' }, { status: 400 })
    }
    const result = await runSpecialistForTask(taskId, specialist, actor)
    return NextResponse.json({
      ok: true,
      job: { id: result.job.id, status: result.job.status, runtime: result.job.runtime },
      artifactId: result.artifactId,
      note: result.note,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}

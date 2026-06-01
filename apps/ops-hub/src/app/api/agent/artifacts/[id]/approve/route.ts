import { NextResponse, type NextRequest } from 'next/server'
import { verifyAgentKey } from '@/lib/api-auth'
import { approveArtifact } from '@/lib/agents/orchestrator'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!verifyAgentKey(req)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  const { id } = await params
  try {
    const body = await req.json().catch(() => ({}))
    const result = await approveArtifact(id, { status: body?.status, note: body?.note, by: body?.by ?? 'agent' })
    return NextResponse.json({ ok: true, task_id: result.taskId, status: result.status })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { pushContentToTaskAgent } from '@/lib/marketing/opsPush'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = (await req.json().catch(() => null)) as
    | { instruction?: string; outputType?: string; priority?: string }
    | null
  if (!body?.instruction || !body?.outputType) {
    return NextResponse.json({ error: 'instruction and outputType are required.' }, { status: 400 })
  }
  const result = await pushContentToTaskAgent({
    contentId: id,
    instruction: body.instruction,
    outputType: body.outputType,
    priority: body.priority,
    byEmail: user.email ?? 'unknown',
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true, taskId: result.taskId })
}

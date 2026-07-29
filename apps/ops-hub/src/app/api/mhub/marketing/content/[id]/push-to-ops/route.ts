import { NextRequest, NextResponse } from 'next/server'
import { requireMarketing, brandInScope } from '@/lib/mhub-auth'
import { getContent } from '@/lib/marketing/content'
import { pushContentToTaskAgent } from '@/lib/marketing/opsPush'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireMarketing(req, 'edit')
  if (gate instanceof NextResponse) return gate
  const { id } = await params
  const content = await getContent(id)
  if (!content) return NextResponse.json({ error: 'Content not found.' }, { status: 404 })
  if (!brandInScope(content.brandId, gate.brandIds)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
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
    byEmail: gate.actor.email ?? 'unknown',
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true, taskId: result.taskId })
}

import { NextResponse, type NextRequest } from 'next/server'
import { verifyAgentKey } from '@/lib/api-auth'
import { submitArtifact } from '@/lib/agents/orchestrator'
import { isSpecialist } from '@/lib/agents/specialistRegistry'

// Submit a finished draft → persists, delivers to Drive, flips task to AI Draft Ready.
export async function POST(req: NextRequest) {
  if (!verifyAgentKey(req)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  try {
    const body = await req.json()
    const { task, specialist, title, content } = body ?? {}
    if (!task || !specialist || !title || !content) {
      return NextResponse.json(
        { ok: false, error: 'task, specialist, title, and content are required' },
        { status: 400 },
      )
    }
    if (!isSpecialist(specialist)) {
      return NextResponse.json({ ok: false, error: `unknown specialist: ${specialist}` }, { status: 400 })
    }
    const { artifact, delivery, deliveryNote } = await submitArtifact({
      taskId: task,
      specialist,
      title,
      content,
      summary: body?.summary,
      deliver: body?.deliver !== false,
    })
    return NextResponse.json({
      ok: true,
      artifact_id: artifact.id,
      doc_link: (delivery?.['web_view_link'] as string) ?? null,
      delivered: Boolean(delivery),
      note: deliveryNote,
    }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}

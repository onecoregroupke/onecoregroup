import { NextRequest, NextResponse } from 'next/server'
import { applyApprovedDeliverable } from '@/lib/marketing/opsPush'

// Webhook called by the Ops Hub when a task (sourced from a content row) is
// approved. Auth is the shared MARKETING_WEBHOOK_SECRET — NOT a user session.
export async function POST(req: NextRequest) {
  const expected = process.env['MARKETING_WEBHOOK_SECRET']
  const body = (await req.json().catch(() => null)) as
    | { secret?: string; content_id?: string; task_id?: string; deliverable?: unknown }
    | null
  if (!expected || !body?.secret || body.secret !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (!body.content_id) {
    return NextResponse.json({ error: 'content_id required' }, { status: 400 })
  }
  const result = await applyApprovedDeliverable({
    contentId: body.content_id,
    deliverable: (body.deliverable as {
      artifact_id?: string
      title?: string
      doc_link?: string | null
      summary?: string
    } | null) ?? null,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}

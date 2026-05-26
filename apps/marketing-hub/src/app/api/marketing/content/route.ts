import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import {
  listContent,
  getContent,
  createContent,
  updateContent,
  transitionContent,
  rescheduleContent,
  archiveContent,
  reopenContent,
  type ListContentFilters,
} from '@/lib/marketing/content'
import type { ContentStatus, ContentType } from '@/lib/marketing/types'

export async function GET(req: NextRequest) {
  if (!(await requireUser(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const params = req.nextUrl.searchParams
  const id = params.get('id')
  if (id) {
    const content = await getContent(id)
    if (!content) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ content })
  }
  const filters: ListContentFilters = {
    brandId: params.get('brand') || undefined,
    platformId: params.get('platform') || undefined,
    status: (params.get('status') as ContentStatus | 'any' | null) || undefined,
    contentType: (params.get('type') as ContentType | null) || undefined,
    pillarId: params.get('pillar') || undefined,
    query: params.get('q') || undefined,
  }
  const content = await listContent(filters)
  return NextResponse.json({ content })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  const result = await createContent({ ...body, createdByEmail: user.email ?? 'unknown' })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ content: result.content })
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as
    | ({ id?: string; action?: string } & Record<string, unknown>)
    | null
  if (!body?.id) return NextResponse.json({ error: 'Content id is required.' }, { status: 400 })
  const { id, action, ...rest } = body
  const byEmail = user.email ?? 'unknown'

  if (action === 'transition') {
    const result = await transitionContent(id, { ...(rest as object), byEmail } as Parameters<typeof transitionContent>[1])
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json({ content: result.content })
  }
  if (action === 'reschedule') {
    const result = await rescheduleContent(
      id,
      rest.scheduledAt as string,
      rest.platformId as string | null | undefined,
    )
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json({ content: result.content })
  }
  if (action === 'archive') {
    await archiveContent(id)
    return NextResponse.json({ ok: true })
  }
  if (action === 'reopen') {
    const result = await reopenContent(id, (rest.toStatus as ContentStatus) ?? 'draft')
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json({ content: result.content })
  }

  // Default: field update.
  const result = await updateContent(id, rest)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ content: result.content })
}

import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { spawnClips, type SpawnClipInput } from '@/lib/marketing/episodes'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = (await req.json().catch(() => null)) as { clips?: SpawnClipInput[] } | null
  if (!body?.clips || !Array.isArray(body.clips)) {
    return NextResponse.json({ error: 'clips array is required.' }, { status: 400 })
  }
  const result = await spawnClips(id, body.clips, user.email ?? 'unknown')
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ created: result.created })
}

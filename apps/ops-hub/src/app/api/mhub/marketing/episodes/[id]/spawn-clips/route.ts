import { NextRequest, NextResponse } from 'next/server'
import { requireMarketing, brandInScope } from '@/lib/mhub-auth'
import { getEpisodeById, spawnClips, type SpawnClipInput } from '@/lib/marketing/episodes'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireMarketing(req, 'edit')
  if (gate instanceof NextResponse) return gate
  const { id } = await params
  const episode = await getEpisodeById(id)
  if (!episode) return NextResponse.json({ error: 'Episode not found.' }, { status: 404 })
  if (!brandInScope(episode.brandId, gate.brandIds)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const body = (await req.json().catch(() => null)) as { clips?: SpawnClipInput[] } | null
  if (!body?.clips || !Array.isArray(body.clips)) {
    return NextResponse.json({ error: 'clips array is required.' }, { status: 400 })
  }
  const result = await spawnClips(id, body.clips, gate.actor.email ?? 'unknown')
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ created: result.created })
}

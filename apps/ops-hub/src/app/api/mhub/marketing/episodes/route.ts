import { NextRequest, NextResponse } from 'next/server'
import { requireMarketing, effectiveBrandIds, brandInScope } from '@/lib/mhub-auth'
import {
  listEpisodes,
  getEpisodeById,
  listEpisodeClips,
  createEpisode,
  updateEpisode,
  type EpisodeStatus,
} from '@/lib/marketing/episodes'

export async function GET(req: NextRequest) {
  const gate = await requireMarketing(req, 'view')
  if (gate instanceof NextResponse) return gate
  const params = req.nextUrl.searchParams
  const id = params.get('id')
  if (id) {
    const episode = await getEpisodeById(id)
    if (!episode) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!brandInScope(episode.brandId, gate.brandIds)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const clips = await listEpisodeClips(id)
    return NextResponse.json({ episode, clips })
  }
  const brand = effectiveBrandIds(params.get('brand'), gate.brandIds)
  if (brand.empty) return NextResponse.json({ episodes: [] })
  const episodes = await listEpisodes({
    brandId: params.get('brand') || undefined,
    brandIds: brand.brandIds,
    status: (params.get('status') as EpisodeStatus | 'any' | null) || undefined,
  })
  return NextResponse.json({ episodes })
}

export async function POST(req: NextRequest) {
  const gate = await requireMarketing(req, 'edit')
  if (gate instanceof NextResponse) return gate
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  if (!brandInScope(body.brandId, gate.brandIds)) {
    return NextResponse.json({ error: 'You can only create episodes for your own brand.' }, { status: 403 })
  }
  const result = await createEpisode({ ...body, createdByEmail: gate.actor.email ?? 'unknown' })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ episode: result.episode })
}

export async function PATCH(req: NextRequest) {
  const gate = await requireMarketing(req, 'edit')
  if (gate instanceof NextResponse) return gate
  const body = (await req.json().catch(() => null)) as ({ id?: string } & Record<string, unknown>) | null
  if (!body?.id) return NextResponse.json({ error: 'Episode id is required.' }, { status: 400 })
  const { id, ...rest } = body
  const existing = await getEpisodeById(id)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!brandInScope(existing.brandId, gate.brandIds)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const result = await updateEpisode(id, rest)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ episode: result.episode })
}

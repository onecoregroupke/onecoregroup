import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import {
  listEpisodes,
  getEpisodeById,
  listEpisodeClips,
  createEpisode,
  updateEpisode,
  type EpisodeStatus,
} from '@/lib/marketing/episodes'

export async function GET(req: NextRequest) {
  if (!(await requireUser(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const params = req.nextUrl.searchParams
  const id = params.get('id')
  if (id) {
    const episode = await getEpisodeById(id)
    if (!episode) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const clips = await listEpisodeClips(id)
    return NextResponse.json({ episode, clips })
  }
  const episodes = await listEpisodes({
    brandId: params.get('brand') || undefined,
    status: (params.get('status') as EpisodeStatus | 'any' | null) || undefined,
  })
  return NextResponse.json({ episodes })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  const result = await createEpisode({ ...body, createdByEmail: user.email ?? 'unknown' })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ episode: result.episode })
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as ({ id?: string } & Record<string, unknown>) | null
  if (!body?.id) return NextResponse.json({ error: 'Episode id is required.' }, { status: 400 })
  const { id, ...rest } = body
  const result = await updateEpisode(id, rest)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ episode: result.episode })
}

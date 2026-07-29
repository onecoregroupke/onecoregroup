import { NextRequest, NextResponse } from 'next/server'
import { requireMhubSection } from '@/lib/mhub-auth'
import { listPillars, createPillar, updatePillar, archivePillar } from '@/lib/marketing/pillars'

// Pillars are a shared, group-wide taxonomy — gated by the `marketing` grant.
export async function GET(req: NextRequest) {
  const gate = await requireMhubSection(req, 'marketing', 'view')
  if (gate instanceof NextResponse) return gate
  const includeInactive = req.nextUrl.searchParams.get('includeInactive') === 'true'
  const pillars = await listPillars(includeInactive)
  return NextResponse.json({ pillars })
}

export async function POST(req: NextRequest) {
  const gate = await requireMhubSection(req, 'marketing', 'edit')
  if (gate instanceof NextResponse) return gate
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  const result = await createPillar(body)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ pillar: result.pillar })
}

export async function PATCH(req: NextRequest) {
  const gate = await requireMhubSection(req, 'marketing', 'edit')
  if (gate instanceof NextResponse) return gate
  const body = (await req.json().catch(() => null)) as ({ id?: string } & Record<string, unknown>) | null
  if (!body?.id) return NextResponse.json({ error: 'Pillar id is required.' }, { status: 400 })
  const { id, archive, ...patch } = body
  if (archive === true) {
    await archivePillar(id)
    return NextResponse.json({ ok: true })
  }
  const result = await updatePillar(id, patch)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ pillar: result.pillar })
}

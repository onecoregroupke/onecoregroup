import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { listPillars, createPillar, updatePillar, archivePillar } from '@/lib/marketing/pillars'

export async function GET(req: NextRequest) {
  if (!(await requireUser(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const includeInactive = req.nextUrl.searchParams.get('includeInactive') === 'true'
  const pillars = await listPillars(includeInactive)
  return NextResponse.json({ pillars })
}

export async function POST(req: NextRequest) {
  if (!(await requireUser(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  const result = await createPillar(body)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ pillar: result.pillar })
}

export async function PATCH(req: NextRequest) {
  if (!(await requireUser(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
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

import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import {
  listPlatforms,
  createPlatform,
  updatePlatform,
  archivePlatform,
} from '@/lib/marketing/platforms'

export async function GET(req: NextRequest) {
  if (!(await requireUser(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const params = req.nextUrl.searchParams
  const platforms = await listPlatforms({
    brandId: params.get('brand') || undefined,
    includeInactive: params.get('includeInactive') === 'true',
  })
  return NextResponse.json({ platforms })
}

export async function POST(req: NextRequest) {
  if (!(await requireUser(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  const result = await createPlatform(body)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ platform: result.platform })
}

export async function PATCH(req: NextRequest) {
  if (!(await requireUser(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = (await req.json().catch(() => null)) as ({ id?: string } & Record<string, unknown>) | null
  if (!body?.id) return NextResponse.json({ error: 'Platform id is required.' }, { status: 400 })
  const { id, archive, ...patch } = body
  if (archive === true) {
    await archivePlatform(id)
    return NextResponse.json({ ok: true })
  }
  const result = await updatePlatform(id, patch)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ platform: result.platform })
}

import { NextRequest, NextResponse } from 'next/server'
import { requireMarketing, effectiveBrandIds, brandInScope } from '@/lib/mhub-auth'
import {
  listPlatforms,
  createPlatform,
  updatePlatform,
  archivePlatform,
} from '@/lib/marketing/platforms'

/** Verify the platform id belongs to the caller's brand compartment. Returns
 *  true for unrestricted callers (admins / full-marketing). */
async function platformInScope(id: string, allowed: string[] | null): Promise<boolean> {
  if (allowed === null) return true
  const mine = await listPlatforms({ brandIds: allowed, includeInactive: true })
  return mine.some((p) => p.id === id)
}

export async function GET(req: NextRequest) {
  const gate = await requireMarketing(req, 'view')
  if (gate instanceof NextResponse) return gate
  const params = req.nextUrl.searchParams
  const brand = effectiveBrandIds(params.get('brand'), gate.brandIds)
  if (brand.empty) return NextResponse.json({ platforms: [] })
  const platforms = await listPlatforms({
    brandId: params.get('brand') || undefined,
    brandIds: brand.brandIds,
    includeInactive: params.get('includeInactive') === 'true',
  })
  return NextResponse.json({ platforms })
}

export async function POST(req: NextRequest) {
  const gate = await requireMarketing(req, 'edit')
  if (gate instanceof NextResponse) return gate
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  if (!brandInScope(body.brandId, gate.brandIds)) {
    return NextResponse.json({ error: 'You can only add platforms for your own brand.' }, { status: 403 })
  }
  const result = await createPlatform(body)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ platform: result.platform })
}

export async function PATCH(req: NextRequest) {
  const gate = await requireMarketing(req, 'edit')
  if (gate instanceof NextResponse) return gate
  const body = (await req.json().catch(() => null)) as ({ id?: string } & Record<string, unknown>) | null
  if (!body?.id) return NextResponse.json({ error: 'Platform id is required.' }, { status: 400 })
  const { id, archive, ...patch } = body
  if (!(await platformInScope(id, gate.brandIds))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (archive === true) {
    await archivePlatform(id)
    return NextResponse.json({ ok: true })
  }
  const result = await updatePlatform(id, patch)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ platform: result.platform })
}

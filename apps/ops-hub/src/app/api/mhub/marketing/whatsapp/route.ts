import { NextRequest, NextResponse } from 'next/server'
import { requireMarketing, effectiveBrandIds, brandInScope } from '@/lib/mhub-auth'
import {
  listFlows,
  getFlowById,
  createFlow,
  updateFlow,
  transitionFlow,
} from '@/lib/marketing/whatsappFlows'

export async function GET(req: NextRequest) {
  const gate = await requireMarketing(req, 'view')
  if (gate instanceof NextResponse) return gate
  const params = req.nextUrl.searchParams
  const id = params.get('id')
  if (id) {
    const flow = await getFlowById(id)
    if (!flow) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!brandInScope(flow.brandId, gate.brandIds)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ flow })
  }
  const brand = effectiveBrandIds(params.get('brand'), gate.brandIds)
  if (brand.empty) return NextResponse.json({ flows: [] })
  const flows = await listFlows({
    brandId: params.get('brand') || undefined,
    brandIds: brand.brandIds,
    includeArchived: params.get('includeArchived') === 'true',
  })
  return NextResponse.json({ flows })
}

export async function POST(req: NextRequest) {
  const gate = await requireMarketing(req, 'edit')
  if (gate instanceof NextResponse) return gate
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  if (!brandInScope(body.brandId, gate.brandIds)) {
    return NextResponse.json({ error: 'You can only create flows for your own brand.' }, { status: 403 })
  }
  const result = await createFlow({ ...body, createdByEmail: gate.actor.email ?? 'unknown' })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ flow: result.flow })
}

export async function PATCH(req: NextRequest) {
  const gate = await requireMarketing(req, 'edit')
  if (gate instanceof NextResponse) return gate
  const body = (await req.json().catch(() => null)) as
    | ({ id?: string; action?: string } & Record<string, unknown>)
    | null
  if (!body?.id) return NextResponse.json({ error: 'Flow id is required.' }, { status: 400 })
  const { id, action, ...rest } = body
  const existing = await getFlowById(id)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!brandInScope(existing.brandId, gate.brandIds)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (action === 'transition') {
    const result = await transitionFlow(id, rest.toStatus as string)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json({ flow: result.flow })
  }
  const result = await updateFlow(id, rest)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ flow: result.flow })
}

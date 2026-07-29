import { NextRequest, NextResponse } from 'next/server'
import { requireMhubSection } from '@/lib/mhub-auth'
import {
  listDeals,
  getDealById,
  createDeal,
  updateDeal,
  transitionDeal,
  type ListDealsFilters,
} from '@/lib/marketing/deals'
import type { DealStage } from '@/lib/marketing/types'

// Deals are part of the group-wide CRM — gated by the `marketing` grant.
export async function GET(req: NextRequest) {
  const gate = await requireMhubSection(req, 'marketing', 'view')
  if (gate instanceof NextResponse) return gate
  const params = req.nextUrl.searchParams
  const id = params.get('id')
  if (id) {
    const deal = await getDealById(id)
    if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ deal })
  }
  const filters: ListDealsFilters = {
    stage: (params.get('stage') as DealStage | 'any' | 'open' | null) || undefined,
    contactId: params.get('contact') || undefined,
    brandId: params.get('brand') || undefined,
  }
  const deals = await listDeals(filters)
  return NextResponse.json({ deals })
}

export async function POST(req: NextRequest) {
  const gate = await requireMhubSection(req, 'marketing', 'edit')
  if (gate instanceof NextResponse) return gate
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  const result = await createDeal({ ...body, createdByEmail: gate.email ?? 'unknown' })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ deal: result.deal })
}

export async function PATCH(req: NextRequest) {
  const gate = await requireMhubSection(req, 'marketing', 'edit')
  if (gate instanceof NextResponse) return gate
  const body = (await req.json().catch(() => null)) as
    | ({ id?: string; action?: string } & Record<string, unknown>)
    | null
  if (!body?.id) return NextResponse.json({ error: 'Deal id is required.' }, { status: 400 })
  const { id, action, ...rest } = body
  if (action === 'transition') {
    const result = await transitionDeal(id, rest.toStage as string, rest.lostReason as string | null)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json({ deal: result.deal })
  }
  const result = await updateDeal(id, rest)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ deal: result.deal })
}

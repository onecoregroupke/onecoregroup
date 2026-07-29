import { NextRequest, NextResponse } from 'next/server'
import { requireMarketing, effectiveBrandIds, brandInScope } from '@/lib/mhub-auth'
import {
  listCampaigns,
  getCampaignById,
  createCampaign,
  updateCampaign,
  transitionCampaign,
  listCampaignContent,
  type ListCampaignsFilters,
} from '@/lib/marketing/campaigns'
import type { CampaignStatus } from '@/lib/marketing/types'

export async function GET(req: NextRequest) {
  const gate = await requireMarketing(req, 'view')
  if (gate instanceof NextResponse) return gate
  const params = req.nextUrl.searchParams
  const id = params.get('id')
  if (id) {
    const campaign = await getCampaignById(id)
    if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!brandInScope(campaign.brandId, gate.brandIds)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const content = await listCampaignContent(id)
    return NextResponse.json({ campaign, content })
  }
  const brand = effectiveBrandIds(params.get('brand'), gate.brandIds)
  if (brand.empty) return NextResponse.json({ campaigns: [] })
  const filters: ListCampaignsFilters = {
    brandId: params.get('brand') || undefined,
    brandIds: brand.brandIds,
    status: (params.get('status') as CampaignStatus | 'any' | 'open' | null) || undefined,
    query: params.get('q') || undefined,
  }
  const campaigns = await listCampaigns(filters)
  return NextResponse.json({ campaigns })
}

export async function POST(req: NextRequest) {
  const gate = await requireMarketing(req, 'edit')
  if (gate instanceof NextResponse) return gate
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  if (!brandInScope(body.brandId, gate.brandIds)) {
    return NextResponse.json({ error: 'You can only create campaigns for your own brand.' }, { status: 403 })
  }
  const result = await createCampaign({ ...body, createdByEmail: gate.actor.email ?? 'unknown' })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ campaign: result.campaign })
}

export async function PATCH(req: NextRequest) {
  const gate = await requireMarketing(req, 'edit')
  if (gate instanceof NextResponse) return gate
  const body = (await req.json().catch(() => null)) as
    | ({ id?: string; action?: string } & Record<string, unknown>)
    | null
  if (!body?.id) return NextResponse.json({ error: 'Campaign id is required.' }, { status: 400 })
  const { id, action, ...rest } = body
  const existing = await getCampaignById(id)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!brandInScope(existing.brandId, gate.brandIds)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (action === 'transition') {
    const result = await transitionCampaign(id, rest.toStatus as string)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json({ campaign: result.campaign })
  }

  const result = await updateCampaign(id, rest)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ campaign: result.campaign })
}

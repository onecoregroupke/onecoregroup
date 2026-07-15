import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
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
  if (!(await requireUser(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const params = req.nextUrl.searchParams
  const id = params.get('id')
  if (id) {
    const campaign = await getCampaignById(id)
    if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const content = await listCampaignContent(id)
    return NextResponse.json({ campaign, content })
  }
  const filters: ListCampaignsFilters = {
    brandId: params.get('brand') || undefined,
    status: (params.get('status') as CampaignStatus | 'any' | 'open' | null) || undefined,
    query: params.get('q') || undefined,
  }
  const campaigns = await listCampaigns(filters)
  return NextResponse.json({ campaigns })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  const result = await createCampaign({ ...body, createdByEmail: user.email ?? 'unknown' })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ campaign: result.campaign })
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as
    | ({ id?: string; action?: string } & Record<string, unknown>)
    | null
  if (!body?.id) return NextResponse.json({ error: 'Campaign id is required.' }, { status: 400 })
  const { id, action, ...rest } = body

  if (action === 'transition') {
    const result = await transitionCampaign(id, rest.toStatus as string)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json({ campaign: result.campaign })
  }

  const result = await updateCampaign(id, rest)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ campaign: result.campaign })
}

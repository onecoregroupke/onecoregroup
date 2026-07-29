import { NextRequest, NextResponse } from 'next/server'
import { requireMarketing, effectiveBrandIds } from '@/lib/mhub-auth'
import { listCalendarContentInRange } from '@/lib/marketing/content'

export async function GET(req: NextRequest) {
  const gate = await requireMarketing(req, 'view')
  if (gate instanceof NextResponse) return gate
  const params = req.nextUrl.searchParams
  const start = params.get('start')
  const end = params.get('end')
  if (!start || !end) {
    return NextResponse.json({ error: 'start and end are required.' }, { status: 400 })
  }
  // Scope the calendar to the caller's brand compartment. A brand-restricted
  // marketer never sees another brand's schedule, even by passing ?brand=.
  const brand = effectiveBrandIds(params.get('brand'), gate.brandIds)
  if (brand.empty) return NextResponse.json({ content: [] })
  const platform = params.get('platform')
  const content = await listCalendarContentInRange(start, end, {
    brandIds: brand.brandIds,
    platformIds: platform ? [platform] : undefined,
  })
  return NextResponse.json({ content })
}

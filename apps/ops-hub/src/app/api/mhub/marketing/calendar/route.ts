import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { listCalendarContentInRange } from '@/lib/marketing/content'

export async function GET(req: NextRequest) {
  if (!(await requireUser(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const params = req.nextUrl.searchParams
  const start = params.get('start')
  const end = params.get('end')
  if (!start || !end) {
    return NextResponse.json({ error: 'start and end are required.' }, { status: 400 })
  }
  const brand = params.get('brand')
  const platform = params.get('platform')
  const content = await listCalendarContentInRange(start, end, {
    brandIds: brand ? [brand] : undefined,
    platformIds: platform ? [platform] : undefined,
  })
  return NextResponse.json({ content })
}

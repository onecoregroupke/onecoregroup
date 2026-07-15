import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { listBrands } from '@/lib/marketing/brands'

export async function GET(req: NextRequest) {
  if (!(await requireUser(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const includeInactive = req.nextUrl.searchParams.get('includeInactive') === 'true'
  const brands = await listBrands(includeInactive)
  return NextResponse.json({ brands })
}

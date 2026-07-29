import { NextRequest, NextResponse } from 'next/server'
import { requireMhubSection } from '@/lib/mhub-auth'
import { listBrands } from '@/lib/marketing/brands'

// The brand catalogue (names/colours) that feeds the marketing brand pickers.
// Not sensitive, but still behind the `marketing` grant like the rest of mhub.
export async function GET(req: NextRequest) {
  const gate = await requireMhubSection(req, 'marketing', 'view')
  if (gate instanceof NextResponse) return gate
  const includeInactive = req.nextUrl.searchParams.get('includeInactive') === 'true'
  const brands = await listBrands(includeInactive)
  return NextResponse.json({ brands })
}

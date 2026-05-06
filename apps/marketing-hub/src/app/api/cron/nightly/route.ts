import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const secret = process.env['CRON_SECRET']

  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // STUB: Instagram + YouTube API calls not yet wired up.
  // Real implementation requires:
  // 1. Meta Developer App approval (Instagram Graph API)
  // 2. Brand-level access tokens stored in brands.instagram_account_id
  // 3. YouTube Data API key configured
  // All of the above are pending — will be wired in Phase 2.

  console.log('[CRON] Nightly cron triggered —', new Date().toISOString())
  console.log('[CRON] Instagram/YouTube API not yet configured — stub only')
  console.log('[CRON] Would fetch metrics for 6 brands and update daily_metrics table')

  return NextResponse.json({
    status: 'stub',
    message: 'API credentials pending Meta approval',
    timestamp: new Date().toISOString(),
    brands_to_sync: ['nairobi-piano-technicians', 'glitz-n-glim', 'nuuranest-stays', 'ar-rayyan-playhouse', 'rhythms-college', 'darul-swafa'],
  })
}

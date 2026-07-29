import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const secret = process.env['CRON_SECRET']
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  console.log('[CRON] Weekly report cron triggered —', new Date().toISOString())
  return NextResponse.json({ status: 'stub', message: 'Weekly report generation — Phase 2' })
}

import { NextRequest, NextResponse } from 'next/server'
import { runDuePublishes } from '@/lib/marketing/publishers/runner'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const secret = process.env['CRON_SECRET']

  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Publish runner: posts due API-mode content (or flags remind-mode for manual
  // posting). Per-platform live API clients are stubbed to remind-only until
  // each platform's credential + Graph/REST call is wired (see publishers/index.ts).
  let publish
  try {
    publish = await runDuePublishes()
  } catch (e) {
    publish = { error: (e as Error).message }
  }

  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    publish,
  })
}

import { NextResponse, type NextRequest } from 'next/server'
import { runCalendarReminders } from '@/lib/calendarReminders'

/** Vercel Cron sweep. Fails closed when CRON_SECRET is absent because it sends
 * employee notifications. Delivery rows provide retry and send idempotency. */
export async function GET(req: NextRequest) {
  const secret = process.env['CRON_SECRET']
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json({ ok: true, ...(await runCalendarReminders()) })
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 })
  }
}

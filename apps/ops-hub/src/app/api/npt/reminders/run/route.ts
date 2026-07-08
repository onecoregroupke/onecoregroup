import { NextResponse, type NextRequest } from 'next/server'
import { runAppointmentReminders } from '@/lib/nptComms'

// Cron-triggered NPT appointment reminder sweep (daily, 8am EAT). Sends the
// T-3d / T-1d / day-of client reminders and the technician reminders for every
// upcoming appointment, deduped via npt_comm_logs. Secured by CRON_SECRET —
// fails closed when unset (it sends client emails).
export async function GET(req: NextRequest) {
  const secret = process.env['CRON_SECRET']
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  try {
    const result = await runAppointmentReminders()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}

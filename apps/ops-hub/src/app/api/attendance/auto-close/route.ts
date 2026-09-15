import { NextResponse, type NextRequest } from 'next/server'
import { autoCloseOpenAttendanceRecords } from '@/lib/attendance'
import { todayInEat } from '@/lib/serverClient'

export async function GET(req: NextRequest) {
  const secret = process.env['CRON_SECRET']
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  try {
    const date = new URL(req.url).searchParams.get('date') ?? todayInEat()
    const result = await autoCloseOpenAttendanceRecords(date)
    return NextResponse.json({
      ok: true,
      attendanceDate: result.attendanceDate,
      closed: result.closed.length,
      eventIds: result.closed.map((event) => event.id),
    })
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 })
  }
}

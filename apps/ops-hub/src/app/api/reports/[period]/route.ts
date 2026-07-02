import { NextResponse, type NextRequest } from 'next/server'
import { generateAndSendReport, type ReportPeriod } from '@/lib/reporting'

const PERIODS = ['daily', 'weekly', 'monthly'] as const

// Cron-triggered ops report (daily/weekly/monthly). Secured by CRON_SECRET when
// set (Authorization: Bearer <CRON_SECRET>); Vercel cron sends this automatically.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ period: string }> },
) {
  const { period } = await params
  if (!(PERIODS as readonly string[]).includes(period)) {
    return NextResponse.json({ ok: false, error: 'period must be daily|weekly|monthly' }, { status: 400 })
  }
  // Fail closed: without a configured CRON_SECRET this report endpoint stays
  // locked rather than becoming world-callable (it sends stakeholder emails).
  const secret = process.env['CRON_SECRET']
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  try {
    const result = await generateAndSendReport(period as ReportPeriod)
    return NextResponse.json({
      ok: true,
      period,
      sent: result.sent,
      summary: {
        completed: result.data.completedCount,
        draftsToReview: result.data.draftReadyCount,
        active: result.data.activeCount,
        overdue: result.data.overdueCount,
      },
      note: result.note,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}

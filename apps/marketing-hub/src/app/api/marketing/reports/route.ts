import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import {
  listReports,
  getReportById,
  generateReport,
  regenerateNarrative,
  updateReport,
  transitionReport,
} from '@/lib/marketing/reports'

export async function GET(req: NextRequest) {
  if (!(await requireUser(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const id = req.nextUrl.searchParams.get('id')
  if (id) {
    const report = await getReportById(id)
    if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ report })
  }
  const reports = await listReports()
  return NextResponse.json({ reports })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as
    | { periodStart?: string; periodEnd?: string }
    | null
  if (!body?.periodStart || !body?.periodEnd) {
    return NextResponse.json({ error: 'periodStart and periodEnd are required.' }, { status: 400 })
  }
  const result = await generateReport({
    periodStart: body.periodStart,
    periodEnd: body.periodEnd,
    createdByEmail: user.email ?? 'unknown',
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ report: result.report })
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as
    | ({ id?: string; action?: string } & Record<string, unknown>)
    | null
  if (!body?.id) return NextResponse.json({ error: 'Report id is required.' }, { status: 400 })
  const { id, action, ...rest } = body

  if (action === 'regenerate') {
    const result = await regenerateNarrative(id)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json({ report: result.report })
  }
  if (action === 'transition') {
    const result = await transitionReport(id, rest.toStatus as string, user.email ?? 'unknown')
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json({ report: result.report })
  }
  const result = await updateReport(id, {
    subject: rest.subject as string | undefined,
    preheader: rest.preheader as string | null | undefined,
    bodyMarkdown: rest.bodyMarkdown as string | undefined,
    recipients: rest.recipients as string[] | undefined,
    scheduledFor: rest.scheduledFor as string | null | undefined,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ report: result.report })
}

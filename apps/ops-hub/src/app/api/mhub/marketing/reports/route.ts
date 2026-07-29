import { NextRequest, NextResponse } from 'next/server'
import { requireMarketing } from '@/lib/mhub-auth'
import {
  listReports,
  getReportById,
  generateReport,
  regenerateNarrative,
  updateReport,
  transitionReport,
} from '@/lib/marketing/reports'

// Executive reports are GROUP-WIDE aggregates (all brands). A brand-restricted
// marketer must not see cross-brand performance, so reports are limited to
// full-marketing users (no brand compartment).
function groupWideOnly(gate: { brandIds: string[] | null }): NextResponse | null {
  if (gate.brandIds !== null) {
    return NextResponse.json({ error: 'Executive reports are limited to group marketing.' }, { status: 403 })
  }
  return null
}

export async function GET(req: NextRequest) {
  const gate = await requireMarketing(req, 'view')
  if (gate instanceof NextResponse) return gate
  const denied = groupWideOnly(gate)
  if (denied) return denied
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
  const gate = await requireMarketing(req, 'edit')
  if (gate instanceof NextResponse) return gate
  const denied = groupWideOnly(gate)
  if (denied) return denied
  const body = (await req.json().catch(() => null)) as
    | { periodStart?: string; periodEnd?: string }
    | null
  if (!body?.periodStart || !body?.periodEnd) {
    return NextResponse.json({ error: 'periodStart and periodEnd are required.' }, { status: 400 })
  }
  const result = await generateReport({
    periodStart: body.periodStart,
    periodEnd: body.periodEnd,
    createdByEmail: gate.actor.email ?? 'unknown',
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ report: result.report })
}

export async function PATCH(req: NextRequest) {
  const gate = await requireMarketing(req, 'edit')
  if (gate instanceof NextResponse) return gate
  const denied = groupWideOnly(gate)
  if (denied) return denied
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
    const result = await transitionReport(id, rest.toStatus as string, gate.actor.email ?? 'unknown')
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

import { NextRequest, NextResponse } from 'next/server'
import { requireMhubSection } from '@/lib/mhub-auth'
import { listLeadsToPromote, promoteLead } from '@/lib/marketing/contacts'

export async function GET(req: NextRequest) {
  const gate = await requireMhubSection(req, 'marketing', 'view')
  if (gate instanceof NextResponse) return gate
  const leads = await listLeadsToPromote()
  return NextResponse.json({ leads })
}

export async function POST(req: NextRequest) {
  const gate = await requireMhubSection(req, 'marketing', 'edit')
  if (gate instanceof NextResponse) return gate
  const body = (await req.json().catch(() => null)) as { leadId?: string } | null
  if (!body?.leadId) return NextResponse.json({ error: 'leadId is required.' }, { status: 400 })
  const result = await promoteLead(body.leadId, gate.email ?? 'unknown')
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ contact: result.contact })
}

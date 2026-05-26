import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { listLeadsToPromote, promoteLead } from '@/lib/marketing/contacts'

export async function GET(req: NextRequest) {
  if (!(await requireUser(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const leads = await listLeadsToPromote()
  return NextResponse.json({ leads })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { leadId?: string } | null
  if (!body?.leadId) return NextResponse.json({ error: 'leadId is required.' }, { status: 400 })
  const result = await promoteLead(body.leadId, user.email ?? 'unknown')
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ contact: result.contact })
}

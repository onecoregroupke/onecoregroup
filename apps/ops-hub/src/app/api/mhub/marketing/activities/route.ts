import { NextRequest, NextResponse } from 'next/server'
import { requireMhubSection } from '@/lib/mhub-auth'
import { listActivitiesForContact, logActivity } from '@/lib/marketing/activities'

export async function GET(req: NextRequest) {
  const gate = await requireMhubSection(req, 'marketing', 'view')
  if (gate instanceof NextResponse) return gate
  const contactId = req.nextUrl.searchParams.get('contact')
  if (!contactId) return NextResponse.json({ error: 'contact is required.' }, { status: 400 })
  const activities = await listActivitiesForContact(contactId)
  return NextResponse.json({ activities })
}

export async function POST(req: NextRequest) {
  const gate = await requireMhubSection(req, 'marketing', 'edit')
  if (gate instanceof NextResponse) return gate
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  const result = await logActivity({ ...body, byEmail: gate.email ?? null })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ activity: result.activity })
}

import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { listActivitiesForContact, logActivity } from '@/lib/marketing/activities'

export async function GET(req: NextRequest) {
  if (!(await requireUser(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const contactId = req.nextUrl.searchParams.get('contact')
  if (!contactId) return NextResponse.json({ error: 'contact is required.' }, { status: 400 })
  const activities = await listActivitiesForContact(contactId)
  return NextResponse.json({ activities })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  const result = await logActivity({ ...body, byEmail: user.email ?? null })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ activity: result.activity })
}

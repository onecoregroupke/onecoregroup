import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { listNotifications, markNotificationsRead } from '@/lib/notifications'

export async function GET(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor?.email) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const notifications = await listNotifications(actor.email)
  return NextResponse.json({ ok: true, notifications })
}

export async function PATCH(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor?.email) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  await markNotificationsRead(actor.email)
  return NextResponse.json({ ok: true })
}

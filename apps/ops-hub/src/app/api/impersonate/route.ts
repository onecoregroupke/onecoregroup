import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { getRealActor } from '@/lib/server-auth'
import { auditEvent } from '@/lib/audit'

/**
 * Founding-admin "enter portal" (view-as). The cookie only stores the target id;
 * getActor re-verifies the real user is a founding admin on every request, so a
 * forged cookie is inert for anyone else. The impersonated session lasts 8h max.
 */
export async function POST(req: NextRequest) {
  const real = await getRealActor()
  if (!real || real.permissions !== null) {
    return NextResponse.json({ ok: false, error: 'Only the main administrator can enter another portal.' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  const userId = String(body?.user_id ?? '')
  if (!userId) return NextResponse.json({ ok: false, error: 'user_id is required' }, { status: 400 })
  if (userId === real.userId) return NextResponse.json({ ok: false, error: 'That is already your own portal.' }, { status: 400 })

  const store = await cookies()
  store.set('ocg_impersonate', userId, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8 })
  await auditEvent({
    actor: real, action: 'update', entity_table: 'impersonation', entity_id: userId,
    entity_label: `Entered the portal of user ${userId}`,
  }).catch(() => {})
  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  const store = await cookies()
  store.delete('ocg_impersonate')
  return NextResponse.json({ ok: true })
}

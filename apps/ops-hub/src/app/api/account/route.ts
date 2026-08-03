import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { db, nowIso } from '@/lib/serverClient'

/**
 * Self-service account API. A user may read + set their own display name.
 * Email is provisioned by administration and is intentionally NOT editable here.
 * Password changes go through Supabase Auth on the client (re-auth + updateUser),
 * so the password never touches this server route.
 */
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db() as any).from('user_permissions').select('display_name').eq('user_id', user.id).maybeSingle()
  return NextResponse.json({ ok: true, email: user.email, display_name: (data as { display_name: string | null } | null)?.display_name ?? '' })
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const body = await req.json()

  if (body?.email !== undefined) {
    // Guard rail: login email is administrator-controlled.
    return NextResponse.json({ ok: false, error: 'Email is managed by administration and cannot be changed here.' }, { status: 403 })
  }

  const displayName = String(body?.display_name ?? '').trim()
  if (!displayName) return NextResponse.json({ ok: false, error: 'Display name is required' }, { status: 400 })
  // UPDATE only — never INSERT: a founding admin has no user_permissions row and
  // must keep null permissions (= full access); creating a row would revoke it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db() as any)
    .from('user_permissions')
    .update({ display_name: displayName, updated_at: nowIso() })
    .eq('user_id', user.id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, display_name: displayName })
}

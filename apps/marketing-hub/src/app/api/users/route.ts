import { createServerClient } from '@ocg/db/client'
import type { PermissionsMap } from '@ocg/db'

// Local type for user_permissions rows (table not in generated DB schema)
type PermRow = {
  id: string
  user_id: string
  display_name: string | null
  permissions: PermissionsMap
  is_active: boolean
  created_at: string
  updated_at: string
}
type PermQuery<T> = { data: T | null; error: { message: string } | null }

// Helper: access user_permissions without DB-schema type errors
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function permTable(supabase: ReturnType<typeof createServerClient>) { return (supabase as any).from('user_permissions') }

/** Verify the caller is a founding admin or has users:edit permission */
async function verifyAdmin(req: Request): Promise<string | null> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null

  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return null

  const { data: row } = await permTable(supabase)
    .select('permissions')
    .eq('user_id', user.id)
    .single() as PermQuery<Pick<PermRow, 'permissions'>>

  // No row → founding admin → allowed
  if (!row) return user.id
  // Has explicit users:edit → allowed
  const perms = row.permissions
  if (perms?.users === 'edit') return user.id
  return null
}

// ── GET /api/users — list all users + their permissions ──────────────────────
export async function GET(req: Request) {
  const adminId = await verifyAdmin(req)
  if (!adminId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()

  const { data: authData, error: authError } = await supabase.auth.admin.listUsers()
  if (authError) return Response.json({ error: authError.message }, { status: 500 })

  const { data: permsRows } = await permTable(supabase).select('*') as PermQuery<PermRow[]>
  const permsMap = Object.fromEntries((permsRows ?? []).map(r => [r.user_id, r]))

  const users = authData.users.map(u => ({
    id: u.id,
    email: u.email ?? '',
    display_name: permsMap[u.id]?.display_name ?? null,
    permissions: permsMap[u.id]?.permissions ?? null, // null = founding admin
    is_active: permsMap[u.id]?.is_active ?? true,
    is_admin: !permsMap[u.id],
    email_confirmed_at: u.email_confirmed_at ?? null,
    last_sign_in_at: u.last_sign_in_at ?? null,
    created_at: u.created_at,
  }))

  return Response.json({ users })
}

// ── POST /api/users — invite a new user ──────────────────────────────────────
export async function POST(req: Request) {
  const adminId = await verifyAdmin(req)
  if (!adminId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    email: string
    display_name?: string
    permissions: PermissionsMap
  }

  if (!body.email?.trim()) {
    return Response.json({ error: 'Email is required.' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Invite the user — Supabase sends them an email with a set-password link
  const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
    body.email.trim(),
    { data: { display_name: body.display_name ?? '' } }
  )
  if (inviteError) return Response.json({ error: inviteError.message }, { status: 500 })

  const userId = inviteData.user.id

  // Store their permissions
  const { data, error } = await permTable(supabase)
    .insert({
      user_id: userId,
      display_name: body.display_name?.trim() || null,
      permissions: body.permissions ?? {},
      is_active: true,
    })
    .select()
    .single() as PermQuery<PermRow>

  if (error || !data) return Response.json({ error: error?.message ?? 'Insert failed' }, { status: 500 })

  return Response.json({
    user: {
      id: userId,
      email: body.email.trim(),
      display_name: data.display_name,
      permissions: data.permissions,
      is_active: data.is_active,
      is_admin: false,
      email_confirmed_at: null,
      last_sign_in_at: null,
      created_at: data.created_at,
    }
  }, { status: 201 })
}

// ── PATCH /api/users — update a user's permissions / name / active state ─────
export async function PATCH(req: Request) {
  const adminId = await verifyAdmin(req)
  if (!adminId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    user_id: string
    display_name?: string
    permissions?: PermissionsMap
    is_active?: boolean
  }
  if (!body.user_id) return Response.json({ error: 'user_id is required.' }, { status: 400 })

  const supabase = createServerClient()

  const updates: Record<string, unknown> = {}
  if (body.display_name !== undefined) updates.display_name = body.display_name?.trim() || null
  if (body.permissions !== undefined) updates.permissions = body.permissions
  if (body.is_active !== undefined) updates.is_active = body.is_active

  const { data, error } = await permTable(supabase)
    .update(updates)
    .eq('user_id', body.user_id)
    .select()
    .single() as PermQuery<PermRow>

  if (error || !data) return Response.json({ error: error?.message ?? 'Update failed' }, { status: 500 })
  return Response.json({ permission: data })
}

// ── DELETE /api/users?id= — permanently delete a user ────────────────────────
export async function DELETE(req: Request) {
  const adminId = await verifyAdmin(req)
  if (!adminId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return Response.json({ error: 'id is required.' }, { status: 400 })

  // Prevent self-deletion
  if (id === adminId) {
    return Response.json({ error: 'You cannot delete your own account.' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { error } = await supabase.auth.admin.deleteUser(id)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}

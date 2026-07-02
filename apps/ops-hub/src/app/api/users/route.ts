import { createServerClient } from '@ocg/db/client'
import type { PermissionsMap, BrandAccessMap } from '@ocg/db'
import { buildCallbackUrl, hubUrl, sendInviteEmail, sendRecoveryEmail } from '@/lib/auth-emails'
import { upsertTeamMemberByEmail, deactivateTeamMemberByEmail } from '@/lib/team'

// Local type for user_permissions rows (table not in generated DB schema)
type PermRow = {
  id: string
  user_id: string
  display_name: string | null
  permissions: PermissionsMap
  brand_access?: BrandAccessMap | null
  is_active: boolean
  created_at: string
  updated_at: string
}
type PermQuery<T> = { data: T | null; error: { message: string } | null }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function permTable(supabase: ReturnType<typeof createServerClient>) { return (supabase as any).from('user_permissions') }

/** Verify the caller is a founding admin or has users:edit permission. */
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
  if (!row) return user.id            // no row → founding admin
  if (row.permissions?.users === 'edit') return user.id
  return null
}

// ── GET /api/users — list portal users + their permissions + access state ─────
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
    brand_access: permsMap[u.id]?.brand_access ?? {},
    is_active: permsMap[u.id]?.is_active ?? true,
    is_admin: !permsMap[u.id],
    email_confirmed_at: u.email_confirmed_at ?? null, // accepted invite
    last_sign_in_at: u.last_sign_in_at ?? null,       // accessed portal
    created_at: u.created_at,
  }))

  return Response.json({ users })
}

// ── POST /api/users — invite a new user, or resend an invite ──────────────────
export async function POST(req: Request) {
  const adminId = await verifyAdmin(req)
  if (!adminId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    action?: 'invite' | 'resend'
    email: string
    user_id?: string
    display_name?: string
    permissions?: PermissionsMap
    brand_access?: BrandAccessMap
    brand_ids?: string[]
    role?: string
  }

  const supabase = createServerClient()
  const email = body.email?.trim()
  if (!email) return Response.json({ error: 'Email is required.' }, { status: 400 })

  // ── Resend: re-issue an invite (unconfirmed) or recovery (confirmed) link ──
  if (body.action === 'resend') {
    let confirmed = false
    if (body.user_id) {
      const { data: u } = await supabase.auth.admin.getUserById(body.user_id)
      confirmed = Boolean(u.user?.email_confirmed_at)
    }
    const { data: linkData, error: linkError } = confirmed
      ? await supabase.auth.admin.generateLink({ type: 'recovery', email })
      : await supabase.auth.admin.generateLink({
          type: 'invite',
          email,
          options: { data: { display_name: body.display_name ?? '', password_set: false }, redirectTo: `${hubUrl()}/auth/callback` },
        })
    if (linkError || !linkData?.properties) {
      return Response.json({ error: linkError?.message ?? 'Could not generate link' }, { status: 500 })
    }
    try {
      const link = buildCallbackUrl(linkData.properties.hashed_token, confirmed ? 'recovery' : 'invite')
      if (confirmed) await sendRecoveryEmail({ email, link })
      else await sendInviteEmail({ email, displayName: body.display_name, link })
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : 'Failed to send email' }, { status: 500 })
    }
    return Response.json({ ok: true, resent: confirmed ? 'recovery' : 'invite' })
  }

  // ── Invite a brand-new portal user ──
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      data: { display_name: body.display_name ?? '', password_set: false },
      redirectTo: `${hubUrl()}/auth/callback`,
    },
  })
  if (linkError || !linkData?.user) {
    return Response.json({ error: linkError?.message ?? 'Could not create invitation' }, { status: 500 })
  }
  const userId = linkData.user.id

  try {
    await sendInviteEmail({
      email,
      displayName: body.display_name,
      link: buildCallbackUrl(linkData.properties.hashed_token, 'invite'),
    })
  } catch (emailErr) {
    await supabase.auth.admin.deleteUser(userId) // roll back the half-created user
    const msg = emailErr instanceof Error ? emailErr.message : 'Failed to send invitation email'
    return Response.json({ error: msg }, { status: 500 })
  }

  const { data, error } = await permTable(supabase)
    .insert({
      user_id: userId,
      display_name: body.display_name?.trim() || null,
      permissions: body.permissions ?? {},
      brand_access: body.brand_access ?? {},
      is_active: true,
    })
    .select()
    .single() as PermQuery<PermRow>
  if (error || !data) return Response.json({ error: error?.message ?? 'Insert failed' }, { status: 500 })

  // Link the portal user to an ops_team_members row so /my-tasks + assignment work.
  await upsertTeamMemberByEmail({
    email,
    name: body.display_name?.trim() || email.split('@')[0],
    role: body.role,
    brand_ids: body.brand_ids,
  })

  return Response.json({
    user: {
      id: userId,
      email,
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

// ── PATCH /api/users — update permissions / name / active / email ─────────────
export async function PATCH(req: Request) {
  const adminId = await verifyAdmin(req)
  if (!adminId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    user_id: string
    display_name?: string
    permissions?: PermissionsMap
    brand_access?: BrandAccessMap
    is_active?: boolean
    email?: string
  }
  if (!body.user_id) return Response.json({ error: 'user_id is required.' }, { status: 400 })

  const supabase = createServerClient()

  // Change the auth email if requested.
  if (body.email !== undefined && body.email.trim()) {
    const { error: emailErr } = await supabase.auth.admin.updateUserById(body.user_id, { email: body.email.trim() })
    if (emailErr) return Response.json({ error: emailErr.message }, { status: 500 })
  }

  const updates: Record<string, unknown> = {}
  if (body.display_name !== undefined) updates.display_name = body.display_name?.trim() || null
  if (body.permissions !== undefined) updates.permissions = body.permissions
  if (body.brand_access !== undefined) updates.brand_access = body.brand_access
  if (body.is_active !== undefined) updates.is_active = body.is_active

  if (Object.keys(updates).length > 0) {
    const { error } = await permTable(supabase)
      .update(updates)
      .eq('user_id', body.user_id) as PermQuery<PermRow>
    if (error) return Response.json({ error: error.message }, { status: 500 })
  }

  // Keep the linked team member in sync (active state mirrors portal access).
  if (body.email?.trim() || body.display_name !== undefined) {
    const { data: u } = await supabase.auth.admin.getUserById(body.user_id)
    const email = body.email?.trim() || u.user?.email
    if (email) {
      await upsertTeamMemberByEmail({ email, name: body.display_name?.trim() || email.split('@')[0] })
    }
  }
  if (body.is_active === false) {
    const { data: u } = await supabase.auth.admin.getUserById(body.user_id)
    if (u.user?.email) await deactivateTeamMemberByEmail(u.user.email)
  }

  return Response.json({ ok: true })
}

// ── DELETE /api/users?id= — remove a portal user ──────────────────────────────
export async function DELETE(req: Request) {
  const adminId = await verifyAdmin(req)
  if (!adminId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return Response.json({ error: 'id is required.' }, { status: 400 })
  if (id === adminId) return Response.json({ error: 'You cannot delete your own account.' }, { status: 400 })

  const supabase = createServerClient()
  const { data: u } = await supabase.auth.admin.getUserById(id)
  const { error } = await supabase.auth.admin.deleteUser(id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (u.user?.email) await deactivateTeamMemberByEmail(u.user.email)

  return Response.json({ ok: true })
}

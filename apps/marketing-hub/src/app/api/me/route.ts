import { createServerClient } from '@ocg/db/client'
import type { PermissionsMap } from '@ocg/db'

type PermRow = { display_name: string | null; permissions: PermissionsMap; is_active: boolean }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function permTable(supabase: ReturnType<typeof createServerClient>) { return (supabase as any).from('user_permissions') }

// ── PATCH /api/me — let any authenticated user update their own display name ──
export async function PATCH(req: Request) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { display_name?: string }
  const display_name = body.display_name?.trim() || null

  const { error } = await permTable(supabase)
    .update({ display_name })
    .eq('user_id', user.id) as { data: PermRow | null; error: { message: string } | null }

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

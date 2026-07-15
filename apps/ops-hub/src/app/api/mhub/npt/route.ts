import { createServerClient } from '@ocg/db/client'
import type { PianoCatalogue } from '@ocg/db'

async function verifyAuth(req: Request) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser(token)
  return user ?? null
}

// GET /api/mhub/npt — all pianos including inactive (admin only)
export async function GET(req: Request) {
  const user = await verifyAuth(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('piano_catalogue')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ pianos: data })
}

// POST /api/mhub/npt — create piano
export async function POST(req: Request) {
  const user = await verifyAuth(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as Partial<PianoCatalogue>
  if (!body.slug || !body.name) {
    return Response.json({ error: 'slug and name are required' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('piano_catalogue')
    .insert(body as Omit<PianoCatalogue, 'id' | 'created_at'>)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ piano: data }, { status: 201 })
}

// PATCH /api/mhub/npt — update piano by id
export async function PATCH(req: Request) {
  const user = await verifyAuth(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as Partial<PianoCatalogue> & { id: string }
  if (!body.id) return Response.json({ error: 'id is required' }, { status: 400 })

  const { id, ...rest } = body
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('piano_catalogue')
    .update(rest)
    .eq('id', id)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ piano: data })
}

// DELETE /api/mhub/npt?id=... — soft-delete (set is_active = false)
export async function DELETE(req: Request) {
  const user = await verifyAuth(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

  const supabase = createServerClient()
  const { error } = await supabase
    .from('piano_catalogue')
    .update({ is_active: false })
    .eq('id', id)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

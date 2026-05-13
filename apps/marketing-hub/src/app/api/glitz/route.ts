import { createServerClient } from '@ocg/db/client'
import type { Product } from '@ocg/db'

async function verifyAuth(req: Request) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser(token)
  return user ?? null
}

// GET /api/glitz — all products (including inactive, for admin)
export async function GET(req: Request) {
  const user = await verifyAuth(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ products: data })
}

// POST /api/glitz — create product
export async function POST(req: Request) {
  const user = await verifyAuth(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as Partial<Product>
  if (!body.slug || !body.name) {
    return Response.json({ error: 'slug and name are required' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('products')
    .insert(body as Omit<Product, 'id' | 'created_at'>)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ product: data }, { status: 201 })
}

// PATCH /api/glitz — update product by id
export async function PATCH(req: Request) {
  const user = await verifyAuth(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as Partial<Product> & { id: string }
  if (!body.id) return Response.json({ error: 'id is required' }, { status: 400 })

  const { id, ...rest } = body
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('products')
    .update(rest)
    .eq('id', id)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ product: data })
}

// DELETE /api/glitz?id=... — soft-delete (set inactive)
export async function DELETE(req: Request) {
  const user = await verifyAuth(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

  const supabase = createServerClient()
  const { error } = await supabase
    .from('products')
    .update({ is_active: false })
    .eq('id', id)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@ocg/db/client'
import type { Product } from '@ocg/db'
import { requireMhubSection } from '@/lib/mhub-auth'

// GET /api/mhub/glitz — all products (including inactive, for admin)
export async function GET(req: NextRequest) {
  const gate = await requireMhubSection(req, 'glitz', 'view')
  if (gate instanceof NextResponse) return gate

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ products: data })
}

// POST /api/mhub/glitz — create product
export async function POST(req: NextRequest) {
  const gate = await requireMhubSection(req, 'glitz', 'edit')
  if (gate instanceof NextResponse) return gate

  const body = (await req.json()) as Partial<Product>
  if (!body.slug || !body.name) {
    return NextResponse.json({ error: 'slug and name are required' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('products')
    .insert(body as Omit<Product, 'id' | 'created_at'>)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ product: data }, { status: 201 })
}

// PATCH /api/mhub/glitz — update product by id
export async function PATCH(req: NextRequest) {
  const gate = await requireMhubSection(req, 'glitz', 'edit')
  if (gate instanceof NextResponse) return gate

  const body = (await req.json()) as Partial<Product> & { id: string }
  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { id, ...rest } = body
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('products')
    .update(rest)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ product: data })
}

// DELETE /api/mhub/glitz?id=... — soft-delete (set inactive)
export async function DELETE(req: NextRequest) {
  const gate = await requireMhubSection(req, 'glitz', 'edit')
  if (gate instanceof NextResponse) return gate

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const supabase = createServerClient()
  const { error } = await supabase
    .from('products')
    .update({ is_active: false })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

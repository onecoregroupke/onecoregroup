import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@ocg/db/client'
import type { PianoCatalogue } from '@ocg/db'
import { requireMhubSection } from '@/lib/mhub-auth'

// GET /api/mhub/npt — all pianos including inactive (admin only)
export async function GET(req: NextRequest) {
  const gate = await requireMhubSection(req, 'npt', 'view')
  if (gate instanceof NextResponse) return gate

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('piano_catalogue')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pianos: data })
}

// POST /api/mhub/npt — create piano
export async function POST(req: NextRequest) {
  const gate = await requireMhubSection(req, 'npt', 'edit')
  if (gate instanceof NextResponse) return gate

  const body = (await req.json()) as Partial<PianoCatalogue>
  if (!body.slug || !body.name) {
    return NextResponse.json({ error: 'slug and name are required' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('piano_catalogue')
    .insert(body as Omit<PianoCatalogue, 'id' | 'created_at'>)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ piano: data }, { status: 201 })
}

// PATCH /api/mhub/npt — update piano by id
export async function PATCH(req: NextRequest) {
  const gate = await requireMhubSection(req, 'npt', 'edit')
  if (gate instanceof NextResponse) return gate

  const body = (await req.json()) as Partial<PianoCatalogue> & { id: string }
  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { id, ...rest } = body
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('piano_catalogue')
    .update(rest)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ piano: data })
}

// DELETE /api/mhub/npt?id=... — soft-delete (set is_active = false)
export async function DELETE(req: NextRequest) {
  const gate = await requireMhubSection(req, 'npt', 'edit')
  if (gate instanceof NextResponse) return gate

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const supabase = createServerClient()
  const { error } = await supabase
    .from('piano_catalogue')
    .update({ is_active: false })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

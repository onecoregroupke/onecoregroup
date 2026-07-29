import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@ocg/db/client'
import type { Product, ProductSize } from '@ocg/db'
import { requireMhubSection } from '@/lib/mhub-auth'

const HEADERS = [
  'slug', 'name', 'variant', 'category', 'category_display_name', 'category_accent',
  'description', 'usage_instructions', 'features', 'sizes', 'images',
  'is_active', 'is_featured', 'is_in_stock', 'sort_order',
]

function csvCell(value: string | null | undefined): string {
  if (value == null) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function productToRow(p: Product): string {
  const sizes = (p.sizes ?? []).map((s: ProductSize) => `${s.label}:${s.price_ksh}`).join('|')
  const features = (p.features ?? []).join('|')
  const images = (p.images ?? []).join('|')

  return [
    p.slug, p.name, p.variant ?? '',
    p.category ?? '', p.category_display_name ?? '', p.category_accent ?? '',
    p.description ?? '', p.usage_instructions ?? '',
    features, sizes, images,
    p.is_active, p.is_featured, p.is_in_stock, p.sort_order,
  ].map(v => csvCell(String(v ?? ''))).join(',')
}

// GET /api/mhub/glitz/export — download CSV of all products
export async function GET(req: NextRequest) {
  const gate = await requireMhubSection(req, 'glitz', 'view')
  if (gate instanceof NextResponse) return gate

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = [HEADERS.join(','), ...(data as Product[]).map(productToRow)]
  const csv = rows.join('\r\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="glitz-catalogue-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}

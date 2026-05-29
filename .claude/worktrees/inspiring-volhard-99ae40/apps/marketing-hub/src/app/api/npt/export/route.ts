import { createServerClient } from '@ocg/db/client'
import type { PianoCatalogue } from '@ocg/db'

async function verifyAuth(req: Request) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser(token)
  return user ?? null
}

const HEADERS = [
  'slug', 'name', 'model', 'serial', 'category', 'condition',
  'price', 'status', 'description', 'highlights', 'finish',
  'size', 'images', 'featured', 'is_active', 'sort_order',
]

function csvCell(value: string | null | undefined): string {
  if (value == null) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function pianoToRow(p: PianoCatalogue): string {
  return [
    p.slug,
    p.name,
    p.model ?? '',
    p.serial ?? '',
    p.category,
    p.condition ?? '',
    p.price,
    p.status,
    p.description ?? '',
    (p.highlights ?? []).join('|'),
    p.finish ?? '',
    p.size ?? '',
    (p.images ?? []).join('|'),
    p.featured,
    p.is_active,
    p.sort_order,
  ].map(v => csvCell(String(v ?? ''))).join(',')
}

// GET /api/npt/export — download CSV of all pianos
export async function GET(req: Request) {
  const user = await verifyAuth(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('piano_catalogue')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const rows = [HEADERS.join(','), ...(data as PianoCatalogue[]).map(pianoToRow)]
  const csv = rows.join('\r\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="npt-catalogue-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}

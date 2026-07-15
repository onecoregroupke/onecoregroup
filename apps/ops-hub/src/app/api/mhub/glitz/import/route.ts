import { createServerClient } from '@ocg/db/client'

async function verifyAuth(req: Request) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser(token)
  return user ?? null
}

/** Minimal CSV parser — handles quoted fields with commas and escaped quotes. */
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  for (const line of lines) {
    if (!line.trim()) continue
    const fields: string[] = []
    let i = 0
    while (i < line.length) {
      if (line[i] === '"') {
        // Quoted field
        let val = ''
        i++ // skip opening quote
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2 }
          else if (line[i] === '"') { i++; break }
          else { val += line[i++] }
        }
        fields.push(val)
        if (line[i] === ',') i++
      } else {
        // Unquoted field
        const end = line.indexOf(',', i)
        if (end === -1) { fields.push(line.slice(i)); break }
        fields.push(line.slice(i, end))
        i = end + 1
      }
    }
    rows.push(fields)
  }
  return rows
}

function parseBool(v: string): boolean {
  return v.toLowerCase() === 'true' || v === '1'
}

function parseNumber(v: string): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function parseSizes(raw: string): { label: string; price_ksh: number }[] {
  if (!raw.trim()) return []
  return raw.split('|').map(pair => {
    const idx = pair.lastIndexOf(':')
    if (idx === -1) return null
    const label = pair.slice(0, idx).trim()
    const price_ksh = parseNumber(pair.slice(idx + 1).trim())
    return label ? { label, price_ksh } : null
  }).filter((x): x is { label: string; price_ksh: number } => x !== null)
}

function parsePipeList(raw: string): string[] {
  return raw.split('|').map(s => s.trim()).filter(Boolean)
}

// POST /api/mhub/glitz/import — upsert products from CSV body
export async function POST(req: Request) {
  const user = await verifyAuth(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const text = await req.text()
  const rows = parseCSV(text)
  if (rows.length < 2) {
    return Response.json({ error: 'CSV must have a header row and at least one data row.' }, { status: 400 })
  }

  const [headerRow, ...dataRows] = rows
  const headers = headerRow.map(h => h.trim().toLowerCase())

  const col = (row: string[], name: string) => row[headers.indexOf(name)]?.trim() ?? ''

  const products = dataRows.map(row => ({
    slug:                 col(row, 'slug'),
    name:                 col(row, 'name'),
    variant:              col(row, 'variant') || null,
    category:             col(row, 'category') || null,
    category_display_name: col(row, 'category_display_name') || null,
    category_accent:      col(row, 'category_accent') || null,
    description:          col(row, 'description') || null,
    usage_instructions:   col(row, 'usage_instructions') || null,
    features:             parsePipeList(col(row, 'features')),
    sizes:                parseSizes(col(row, 'sizes')),
    images:               parsePipeList(col(row, 'images')),
    is_active:            parseBool(col(row, 'is_active') || 'true'),
    is_featured:          parseBool(col(row, 'is_featured') || 'false'),
    is_in_stock:          parseBool(col(row, 'is_in_stock') || 'true'),
    sort_order:           parseNumber(col(row, 'sort_order') || '0'),
    before_after_images:  [],
    price_ksh:            null,
    compare_price_ksh:    null,
    short_description:    null,
  })).filter(p => p.slug && p.name)

  if (!products.length) {
    return Response.json({ error: 'No valid rows found (slug and name are required).' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('products')
    .upsert(products, { onConflict: 'slug' })
    .select()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ imported: data?.length ?? 0, products: data })
}

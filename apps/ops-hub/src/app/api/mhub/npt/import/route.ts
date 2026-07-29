import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@ocg/db/client'
import { requireMhubSection } from '@/lib/mhub-auth'

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  for (const line of lines) {
    if (!line.trim()) continue
    const fields: string[] = []
    let i = 0
    while (i < line.length) {
      if (line[i] === '"') {
        let val = ''
        i++
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2 }
          else if (line[i] === '"') { i++; break }
          else { val += line[i++] }
        }
        fields.push(val)
        if (line[i] === ',') i++
      } else {
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

function parseBool(v: string, fallback = true): boolean {
  if (!v.trim()) return fallback
  return v.toLowerCase() === 'true' || v === '1'
}

function parsePipeList(raw: string): string[] {
  return raw.split('|').map(s => s.trim()).filter(Boolean)
}

// POST /api/mhub/npt/import — upsert pianos from CSV body
export async function POST(req: NextRequest) {
  const gate = await requireMhubSection(req, 'npt', 'edit')
  if (gate instanceof NextResponse) return gate

  const text = await req.text()
  const rows = parseCSV(text)
  if (rows.length < 2) {
    return Response.json({ error: 'CSV must have a header row and at least one data row.' }, { status: 400 })
  }

  const [headerRow, ...dataRows] = rows
  const headers = headerRow.map(h => h.trim().toLowerCase())
  const col = (row: string[], name: string) => row[headers.indexOf(name)]?.trim() ?? ''

  const pianos = dataRows.map(row => ({
    slug:        col(row, 'slug'),
    name:        col(row, 'name'),
    model:       col(row, 'model') || null,
    serial:      col(row, 'serial') || null,
    category:    col(row, 'category') || 'Upright',
    condition:   col(row, 'condition') || null,
    price:       col(row, 'price') || 'Enquire',
    status:      col(row, 'status') || 'Available',
    description: col(row, 'description') || null,
    highlights:  parsePipeList(col(row, 'highlights')),
    finish:      col(row, 'finish') || null,
    size:        col(row, 'size') || null,
    images:      parsePipeList(col(row, 'images')),
    featured:    parseBool(col(row, 'featured'), false),
    is_active:   parseBool(col(row, 'is_active'), true),
    sort_order:  Number(col(row, 'sort_order')) || 0,
  })).filter(p => p.slug && p.name)

  if (!pianos.length) {
    return Response.json({ error: 'No valid rows found (slug and name are required).' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('piano_catalogue')
    .upsert(pianos, { onConflict: 'slug' })
    .select()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ imported: data?.length ?? 0, pianos: data })
}

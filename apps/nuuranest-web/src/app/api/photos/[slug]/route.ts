import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  // Basic slug validation — no path traversal
  if (!slug || /[^a-z0-9-]/.test(slug)) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 })
  }

  try {
    const dir = path.join(process.cwd(), 'public', 'properties', slug)
    const files = fs
      .readdirSync(dir)
      .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
      .sort((a, b) => {
        const n = (s: string) => parseInt(s.replace(/\D/g, ''), 10) || 0
        return n(a) - n(b)
      })

    const base = process.env['NEXT_PUBLIC_SITE_URL'] ?? ''
    const photos = files.map((f) => `${base}/properties/${slug}/${f}`)

    return NextResponse.json({ photos }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=60',
      },
    })
  } catch {
    return NextResponse.json({ photos: [] }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { requireMarketing, brandInScope } from '@/lib/mhub-auth'
import { getContent, updateContent } from '@/lib/marketing/content'
import { uploadMedia } from '@/lib/marketing/mediaStorage'

// Upload a media file (image/video) and attach its public URL to the content row.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireMarketing(req, 'edit')
  if (gate instanceof NextResponse) return gate
  const { id } = await params
  const content = await getContent(id)
  if (!content) return NextResponse.json({ error: 'Content not found.' }, { status: 404 })
  if (!brandInScope(content.brandId, gate.brandIds)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let file: File | null = null
  try {
    const form = await req.formData()
    file = form.get('file') as File | null
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data with a "file" field.' }, { status: 400 })
  }
  if (!file) return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
  if (file.size > 209715200) return NextResponse.json({ error: 'File exceeds 200 MB.' }, { status: 413 })

  const bytes = Buffer.from(await file.arrayBuffer())
  const up = await uploadMedia({
    brandId: content.brandId,
    contentId: id,
    fileName: file.name || 'upload',
    contentType: file.type || 'application/octet-stream',
    bytes,
  })
  if (!up.ok) return NextResponse.json({ error: up.error }, { status: 500 })

  const assetUrls = [...content.assetUrls, up.url]
  const result = await updateContent(id, { assetUrls })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ url: up.url, assetUrls })
}

// Remove a media URL from the content row (does not delete the stored object).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireMarketing(req, 'edit')
  if (gate instanceof NextResponse) return gate
  const { id } = await params
  const content = await getContent(id)
  if (!content) return NextResponse.json({ error: 'Content not found.' }, { status: 404 })
  if (!brandInScope(content.brandId, gate.brandIds)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const body = (await req.json().catch(() => null)) as { url?: string } | null
  if (!body?.url) return NextResponse.json({ error: 'url is required.' }, { status: 400 })
  const assetUrls = content.assetUrls.filter((u) => u !== body.url)
  const result = await updateContent(id, { assetUrls })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ assetUrls })
}

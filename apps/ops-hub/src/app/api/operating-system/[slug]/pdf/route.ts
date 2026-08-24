import { NextResponse, type NextRequest } from 'next/server'
import { getActor } from '@/lib/server-auth'
import { getManual, canOpenManual, resolveManualContent, manualStatusLabel } from '@/lib/operatingSystem/service'
import { renderManualPdf } from '@/lib/operatingSystem/pdf'

// pdfkit is a Node library (streams, Buffer), so this route cannot run on edge.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Download one Operating System manual as a PDF (§8).
 *
 * Renders from the SAME resolved ManualDocument the reader displays, so the
 * download and the page cannot say different things.
 *
 * The route is a plain <a href> from the page, so it authenticates from the
 * session cookie rather than a Bearer token — and it repeats the manual's brand
 * scope check, because a downloadable document is exactly the thing worth
 * trying to fetch directly.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const actor = await getActor()
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  if (!actor.can('knowledge', 'view')) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  const { slug } = await params
  const manual = await getManual(slug)
  if (!manual || !manual.version) {
    return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  }
  if (!canOpenManual(manual, actor.allowedBrandIds('knowledge'))) {
    return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  }

  const doc = resolveManualContent(manual.version)
  if (!doc) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })

  const pdf = await renderManualPdf(doc, {
    entity: manual.brandName,
    versionNo: manual.version.version_no,
    statusLabel: manualStatusLabel(manual.version.status),
    generatedAt: new Date(manual.version.created_at).toLocaleDateString('en-KE', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Nairobi',
    }),
    sourceSummary: manual.version.source_summary,
  })

  const filename = `${manual.slug}-operating-system-v${manual.version.version_no}.pdf`
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(pdf.byteLength),
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

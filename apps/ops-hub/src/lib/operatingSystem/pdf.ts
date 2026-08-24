import PDFDocument from 'pdfkit'
import type { ManualBlock, ManualDocument } from './model'

// =============================================================================
// The Operating System PDF (§8).
//
// Consumes the SAME ManualDocument the web reader renders (§7). There is no
// separate PDF copy of the text — if this file and the reader ever disagree
// about what a chapter says, it is a rendering bug, not a content difference.
//
// Base-14 Helvetica only: no font files to bundle, so this cannot break in a
// serverless build because an .ttf failed to resolve.
// =============================================================================

const NAVY = '#1a1a2e'
const GOLD = '#b07a00'
const GREY = '#6b7280'
const LIGHT = '#9ca3af'
const RULE = '#e5e7eb'

const MARGIN = 56
const PAGE_WIDTH = 595.28   // A4 portrait
const PAGE_HEIGHT = 841.89
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2

export interface PdfMeta {
  entity: string
  versionNo: number
  statusLabel: string
  generatedAt: string
  sourceSummary: string
}

/**
 * Render a manual to a PDF buffer.
 *
 * Returns a Buffer rather than a stream so the route handler can set an honest
 * Content-Length and so a generation failure surfaces as an error rather than
 * as a truncated download.
 */
export async function renderManualPdf(doc: ManualDocument, meta: PdfMeta): Promise<Buffer> {
  const pdf = new PDFDocument({
    size: 'A4',
    margins: { top: MARGIN, bottom: MARGIN + 18, left: MARGIN, right: MARGIN },
    info: {
      Title: `${doc.title} · v${meta.versionNo}`,
      Author: meta.entity,
      Subject: 'Operating System',
      Creator: 'One Core Group Ops Hub',
    },
    autoFirstPage: false,
    // Hold pages in memory so footers can be stamped in a second pass. Doing it
    // from the 'pageAdded' event instead recurses: the footer's own text sits
    // below the bottom margin, pdfkit paginates to fit it, which fires
    // 'pageAdded' again. Buffering also means the footer can say "of N".
    bufferPages: true,
  })

  const chunks: Buffer[] = []
  pdf.on('data', (chunk: Buffer) => chunks.push(chunk))
  const done = new Promise<Buffer>((resolve, reject) => {
    pdf.on('end', () => resolve(Buffer.concat(chunks)))
    pdf.on('error', reject)
  })

  pdf.addPage()
  renderCover(pdf, doc, meta)

  pdf.addPage()
  renderContents(pdf, doc)

  for (const [index, chapter] of doc.chapters.entries()) {
    // Start a chapter on a fresh page only when the current one is too full to
    // hold a heading plus meaningful content. Forcing a page break for every
    // short chapter turns a readable manual into a stack of half-empty sheets.
    if (index === 0 || pdf.y > PAGE_HEIGHT - MARGIN - 300) {
      pdf.addPage()
    } else {
      pdf.y += 26
    }
    renderChapterHeading(pdf, chapter.title, chapter.summary, index + 1)
    for (const block of chapter.blocks) renderBlock(pdf, block)
  }

  // Second pass: footers on every page except the cover.
  const range = pdf.bufferedPageRange()
  for (let i = range.start + 1; i < range.start + range.count; i++) {
    pdf.switchToPage(i)
    stampFooter(pdf, meta, i + 1, range.count)
  }
  pdf.flushPages()

  pdf.end()
  return done
}

// ─── Page furniture ─────────────────────────────────────────────────────────

/**
 * The per-page footer identifying the entity and version (§8).
 *
 * Called only from the buffered second pass. `lineBreak: false` and an explicit
 * width keep pdfkit from trying to wrap — and therefore paginate — inside the
 * bottom margin.
 */
function stampFooter(pdf: PDFKit.PDFDocument, meta: PdfMeta, page: number, total: number) {
  const y = PAGE_HEIGHT - MARGIN - 4
  // The footer deliberately sits BELOW the bottom margin. pdfkit treats any
  // text past the margin as an overflow and starts a new page — which, in a
  // footer pass, means every stamp spawns another blank page to stamp. Lifting
  // the margin for the duration is the documented way to write into it.
  const bottomMargin = pdf.page.margins.bottom
  pdf.page.margins.bottom = 0
  pdf.save()
  pdf.moveTo(MARGIN, y - 8).lineTo(PAGE_WIDTH - MARGIN, y - 8).lineWidth(0.5).strokeColor(RULE).stroke()
  pdf.font('Helvetica').fontSize(7.5).fillColor(LIGHT)
  pdf.text(`${meta.entity} · Operating System · v${meta.versionNo} · ${meta.statusLabel}`, MARGIN, y, {
    width: CONTENT_WIDTH - 60, lineBreak: false,
  })
  pdf.text(`${page} of ${total}`, PAGE_WIDTH - MARGIN - 60, y, {
    width: 60, align: 'right', lineBreak: false,
  })
  pdf.restore()
  pdf.page.margins.bottom = bottomMargin
}

function renderCover(pdf: PDFKit.PDFDocument, doc: ManualDocument, meta: PdfMeta) {
  pdf.rect(0, 0, PAGE_WIDTH, 190).fill(NAVY)

  pdf.font('Helvetica-Bold').fontSize(20).fillColor('#ffffff')
  pdf.text('One Core Group', MARGIN, 62, { width: CONTENT_WIDTH })
  pdf.font('Helvetica').fontSize(11).fillColor(GOLD)
  pdf.text('Operating System', MARGIN, 90, { width: CONTENT_WIDTH })

  pdf.font('Helvetica').fontSize(9).fillColor('#ffffff')
  pdf.text(meta.entity.toUpperCase(), MARGIN, 138, { width: CONTENT_WIDTH, characterSpacing: 1.6 })

  pdf.font('Helvetica-Bold').fontSize(26).fillColor(NAVY)
  pdf.text(doc.title, MARGIN, 240, { width: CONTENT_WIDTH, lineGap: 2 })

  pdf.moveDown(0.8)
  pdf.font('Helvetica').fontSize(10.5).fillColor(GREY)
  pdf.text(doc.intro, { width: CONTENT_WIDTH, align: 'left', lineGap: 2.5 })

  // Metadata block
  const y = Math.max(pdf.y + 28, 470)
  pdf.moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).lineWidth(0.75).strokeColor(RULE).stroke()

  const rows: [string, string][] = [
    ['Entity', meta.entity],
    ['Version', `v${meta.versionNo}`],
    ['Status', meta.statusLabel],
    ['Generated', meta.generatedAt],
    ['Chapters', String(doc.chapters.length)],
  ]
  let rowY = y + 14
  for (const [label, value] of rows) {
    pdf.font('Helvetica-Bold').fontSize(8).fillColor(LIGHT)
    pdf.text(label.toUpperCase(), MARGIN, rowY, { width: 110, characterSpacing: 0.8, lineBreak: false })
    pdf.font('Helvetica').fontSize(10).fillColor(NAVY)
    pdf.text(value, MARGIN + 120, rowY - 1.5, { width: CONTENT_WIDTH - 120, lineBreak: false })
    rowY += 19
  }

  if (meta.sourceSummary) {
    pdf.font('Helvetica-Bold').fontSize(8).fillColor(LIGHT)
    pdf.text('SOURCES', MARGIN, rowY + 10, { width: CONTENT_WIDTH, characterSpacing: 0.8 })
    pdf.font('Helvetica').fontSize(8.5).fillColor(GREY)
    pdf.text(meta.sourceSummary, MARGIN, rowY + 24, { width: CONTENT_WIDTH, lineGap: 1.5 })
  }
}

function renderContents(pdf: PDFKit.PDFDocument, doc: ManualDocument) {
  pdf.font('Helvetica-Bold').fontSize(16).fillColor(NAVY)
  pdf.text('Contents', MARGIN, MARGIN, { width: CONTENT_WIDTH })
  pdf.moveDown(0.9)

  for (const [index, chapter] of doc.chapters.entries()) {
    ensureRoom(pdf, 34)
    const y = pdf.y
    pdf.font('Helvetica').fontSize(9).fillColor(LIGHT)
    pdf.text(String(index + 1), MARGIN, y + 1, { width: 22, lineBreak: false })
    pdf.font('Helvetica-Bold').fontSize(10.5).fillColor(NAVY)
    pdf.text(chapter.title, MARGIN + 24, y, { width: CONTENT_WIDTH - 24 })
    if (chapter.summary) {
      pdf.font('Helvetica').fontSize(8.5).fillColor(GREY)
      pdf.text(chapter.summary, MARGIN + 24, pdf.y + 1, { width: CONTENT_WIDTH - 24 })
    }
    pdf.moveDown(0.55)
  }
}

// ─── Blocks ─────────────────────────────────────────────────────────────────

/** Start a new page if less than `needed` points remain. */
function ensureRoom(pdf: PDFKit.PDFDocument, needed: number) {
  if (pdf.y + needed > PAGE_HEIGHT - MARGIN - 26) pdf.addPage()
}

function renderChapterHeading(pdf: PDFKit.PDFDocument, title: string, summary: string | undefined, number: number) {
  pdf.font('Helvetica-Bold').fontSize(8).fillColor(GOLD)
  pdf.text(`CHAPTER ${number}`, MARGIN, pdf.y, { width: CONTENT_WIDTH, characterSpacing: 1.2 })
  pdf.font('Helvetica-Bold').fontSize(18).fillColor(NAVY)
  pdf.text(title, MARGIN, pdf.y + 4, { width: CONTENT_WIDTH, lineGap: 1 })
  if (summary) {
    pdf.font('Helvetica-Oblique').fontSize(9.5).fillColor(GREY)
    pdf.text(summary, MARGIN, pdf.y + 3, { width: CONTENT_WIDTH })
  }
  pdf.moveTo(MARGIN, pdf.y + 8).lineTo(PAGE_WIDTH - MARGIN, pdf.y + 8).lineWidth(0.75).strokeColor(RULE).stroke()
  pdf.y += 18
}

function renderBlock(pdf: PDFKit.PDFDocument, block: ManualBlock) {
  switch (block.kind) {
    case 'paragraph':
      ensureRoom(pdf, 42)
      pdf.font('Helvetica').fontSize(10).fillColor('#374151')
      pdf.text(block.text, MARGIN, pdf.y, { width: CONTENT_WIDTH, align: 'left', lineGap: 2.2 })
      pdf.moveDown(0.7)
      break

    case 'list':
      for (const [i, item] of block.items.entries()) {
        ensureRoom(pdf, 26)
        const marker = block.ordered ? `${i + 1}.` : '•'
        const y = pdf.y
        pdf.font('Helvetica').fontSize(10).fillColor(LIGHT)
        pdf.text(marker, MARGIN + 6, y, { width: 16, lineBreak: false })
        pdf.font('Helvetica').fontSize(10).fillColor('#374151')
        pdf.text(item, MARGIN + 24, y, { width: CONTENT_WIDTH - 24, lineGap: 1.8 })
        pdf.moveDown(0.25)
      }
      pdf.moveDown(0.45)
      break

    case 'flow': {
      ensureRoom(pdf, 60)
      if (block.title) {
        pdf.font('Helvetica-Bold').fontSize(8).fillColor(LIGHT)
        pdf.text(block.title.toUpperCase(), MARGIN, pdf.y, { width: CONTENT_WIDTH, characterSpacing: 0.9 })
        pdf.moveDown(0.35)
      }
      for (const [i, step] of block.steps.entries()) {
        ensureRoom(pdf, 24)
        const y = pdf.y
        pdf.font('Helvetica-Bold').fontSize(8.5).fillColor(GOLD)
        pdf.text(`${i + 1}`, MARGIN + 6, y + 1, { width: 16, lineBreak: false })
        pdf.font('Helvetica').fontSize(10).fillColor('#374151')
        pdf.text(step, MARGIN + 24, y, { width: CONTENT_WIDTH - 24, lineGap: 1.6 })
        pdf.moveDown(0.2)
      }
      pdf.moveDown(0.5)
      break
    }

    case 'control':
      for (const row of block.rows) {
        ensureRoom(pdf, 34)
        const y = pdf.y
        pdf.font('Helvetica-Bold').fontSize(7.5).fillColor(LIGHT)
        pdf.text(row.label.toUpperCase(), MARGIN, y + 1.5, { width: 96, characterSpacing: 0.6 })
        pdf.font('Helvetica').fontSize(10).fillColor('#374151')
        pdf.text(row.value, MARGIN + 104, y, { width: CONTENT_WIDTH - 104, lineGap: 1.8 })
        pdf.moveDown(0.4)
      }
      pdf.moveDown(0.4)
      break

    case 'callout': {
      ensureRoom(pdf, 58)
      const accent = block.tone === 'warning' ? '#b45309' : block.tone === 'legacy' ? '#7c3aed' : '#2563eb'
      const top = pdf.y
      pdf.font('Helvetica-Bold').fontSize(8).fillColor(accent)
      const heading = block.title
        ? block.title.toUpperCase()
        : block.tone === 'legacy' ? 'HISTORICAL REFERENCE' : block.tone === 'warning' ? 'IMPORTANT' : 'NOTE'
      pdf.text(heading, MARGIN + 12, top, { width: CONTENT_WIDTH - 12, characterSpacing: 0.9 })
      pdf.font('Helvetica').fontSize(9.5).fillColor('#374151')
      pdf.text(block.text, MARGIN + 12, pdf.y + 2, { width: CONTENT_WIDTH - 12, lineGap: 1.8 })
      // Accent rule down the left of the whole callout.
      pdf.save()
      pdf.rect(MARGIN, top - 2, 2.5, pdf.y - top + 4).fill(accent)
      pdf.restore()
      pdf.moveDown(0.8)
      break
    }

    case 'systemLink':
      ensureRoom(pdf, 26)
      pdf.font('Helvetica-Bold').fontSize(9.5).fillColor(NAVY)
      pdf.text(`→ ${block.label}`, MARGIN + 6, pdf.y, { width: CONTENT_WIDTH - 6 })
      if (block.description) {
        pdf.font('Helvetica').fontSize(8.5).fillColor(GREY)
        pdf.text(block.description, MARGIN + 18, pdf.y + 1, { width: CONTENT_WIDTH - 18 })
      }
      pdf.moveDown(0.45)
      break

    case 'knowledge':
      ensureRoom(pdf, 30)
      pdf.font('Helvetica-Bold').fontSize(7.5).fillColor(LIGHT)
      pdf.text('RELATED KNOWLEDGE', MARGIN, pdf.y, { width: CONTENT_WIDTH, characterSpacing: 0.8 })
      pdf.font('Helvetica').fontSize(9.5).fillColor(GREY)
      pdf.text(block.titles.join(' · '), MARGIN, pdf.y + 2, { width: CONTENT_WIDTH, lineGap: 1.5 })
      pdf.moveDown(0.6)
      break

    case 'dynamic':
      // Live sections are a screen affordance. A PDF is a snapshot the moment it
      // is downloaded, and printing today's staff list into a document someone
      // keeps for a year would be worse than saying where to look.
      ensureRoom(pdf, 34)
      pdf.font('Helvetica-Bold').fontSize(7.5).fillColor(LIGHT)
      pdf.text(block.title.toUpperCase(), MARGIN, pdf.y, { width: CONTENT_WIDTH, characterSpacing: 0.8 })
      pdf.font('Helvetica-Oblique').fontSize(9).fillColor(GREY)
      pdf.text(
        'This section shows current records in the Ops Hub and is not reproduced in the PDF, which is a point-in-time snapshot.',
        MARGIN, pdf.y + 2, { width: CONTENT_WIDTH, lineGap: 1.5 },
      )
      pdf.moveDown(0.6)
      break
  }
}

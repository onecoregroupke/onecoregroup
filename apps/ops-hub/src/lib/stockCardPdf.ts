import PDFDocument from 'pdfkit'
import type { PeriodBalance, StockCardRow } from './stockCards'
import { inventoryBreadcrumb } from './inventoryTaxonomy'
import { normalizeDisplayNomenclature } from './inventoryPresentation'

export interface StockCardPdfInput {
  company: string
  brand: string
  store: string
  itemType: string
  category: string
  subcategory: string
  family: string
  pack: string
  from: string
  to: string
  balances: PeriodBalance[]
  ledger: StockCardRow[]
  selectedItemName: string
  generatedBy: string
  generatedAt: Date
}

/** Controlled server-side PDF for exactly one authorised stock-card view. */
export async function createStockCardPdf(input: StockCardPdfInput): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 38,
    info: { Title: `${input.brand} stock card ${input.from} to ${input.to}` },
  })
  const chunks: Buffer[] = []
  doc.on('data', (chunk: Buffer) => chunks.push(chunk))
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  let pageNumber = 1
  title(doc, input)
  balanceHeader(doc)
  if (input.balances.length === 0) {
    doc.fillColor('#667085').font('Helvetica').fontSize(10).text('No stock-card rows match the applied filters.', 44, doc.y + 14)
    doc.y += 38
  }
  for (const balance of input.balances) {
    if (doc.y > 505) {
      footer(doc, pageNumber)
      doc.addPage()
      pageNumber += 1
      continuationTitle(doc, 'Balance summary', input)
      balanceHeader(doc)
    }
    drawBalance(doc, balance)
  }

  if (input.selectedItemName) {
    // Movement history has a different column grid and always starts on a
    // fresh page; this prevents it from overlapping a short balance table.
    footer(doc, pageNumber)
    doc.addPage()
    pageNumber += 1
    continuationTitle(doc, `Movement history · ${input.selectedItemName}`, input)
    ledgerHeader(doc)
    if (input.ledger.length === 0) {
      doc.fillColor('#667085').font('Helvetica').fontSize(10).text('No movements for this item in the selected window.', 44, doc.y + 14)
      doc.y += 38
    }
    for (const row of input.ledger) {
      if (doc.y > 505) {
        footer(doc, pageNumber)
        doc.addPage()
        pageNumber += 1
        continuationTitle(doc, `Movement history · ${input.selectedItemName}`, input)
        ledgerHeader(doc)
      }
      drawLedgerRow(doc, row)
    }
  }

  footer(doc, pageNumber)
  doc.end()
  return done
}

function title(doc: PDFKit.PDFDocument, input: StockCardPdfInput) {
  doc.fillColor('#b07a00').font('Helvetica-Bold').fontSize(9).text(input.company.toUpperCase(), { characterSpacing: 1.4 })
  doc.fillColor('#1a1a2e').fontSize(20).text('Stock Card')
  doc.fillColor('#667085').font('Helvetica').fontSize(9).text('CONTROLLED CURRENT-VIEW LEDGER EXPORT')
  doc.moveDown(0.5)
  doc.fillColor('#344054').fontSize(8.5).text(`Period: ${input.from} to ${input.to}   |   Brand: ${input.brand}   |   Store: ${input.store}`)
  doc.text(filterLine(input))
  doc.text(`Generated: ${input.generatedAt.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}   |   By: ${input.generatedBy}`)
  doc.moveDown(0.8)

  const units = new Set(input.balances.map((row) => row.base_unit || row.unit).filter(Boolean))
  const unit = units.size === 1 ? [...units][0]! : ''
  const sum = (field: 'opening' | 'quantity_in' | 'quantity_out' | 'closing') => input.balances.reduce((total, row) => total + row[field], 0)
  const totalValue = input.balances.reduce((total, row) => total + row.value_ksh, 0)
  doc.roundedRect(38, doc.y, 766, 38, 5).fill('#F8F9FB')
  const y = doc.y + 10
  doc.fillColor('#1a1a2e').font('Helvetica-Bold').fontSize(9)
  doc.text(`${input.balances.length} items`, 50, y, { width: 90 })
  const summary = unit
    ? `Opening ${number(sum('opening'))} ${unit}   |   In ${number(sum('quantity_in'))}   |   Out ${number(sum('quantity_out'))}   |   Closing ${number(sum('closing'))} ${unit}`
    : 'Mixed units — totals remain separated in the item rows'
  doc.font('Helvetica').text(summary, 140, y, { width: 470 })
  doc.font('Helvetica-Bold').text(`KSh ${number(totalValue)}`, 650, y, { width: 140, align: 'right' })
  doc.y = y + 34
}

function continuationTitle(doc: PDFKit.PDFDocument, heading: string, input: StockCardPdfInput) {
  doc.fillColor('#b07a00').font('Helvetica-Bold').fontSize(8).text(input.company.toUpperCase(), 38, 38)
  doc.fillColor('#1a1a2e').fontSize(13).text(heading, 38, 51)
  doc.fillColor('#667085').font('Helvetica').fontSize(7.5).text(`${input.from} to ${input.to} · ${input.brand} · controlled current view`, 38, 68)
  doc.y = 84
}

function filterLine(input: StockCardPdfInput): string {
  const filters = [
    input.itemType && `Type: ${input.itemType.replace(/_/g, ' ')}`,
    input.category && `Category: ${input.category}`,
    input.subcategory && `Subcategory: ${input.subcategory}`,
    input.family && `Family: ${input.family}`,
    input.pack && `Pack: ${input.pack}`,
    input.selectedItemName && `Item: ${input.selectedItemName}`,
  ].filter(Boolean)
  return filters.length ? `Filters: ${filters.join(' | ')}` : 'Filters: All authorised stock items'
}

function balanceHeader(doc: PDFKit.PDFDocument) {
  const y = doc.y
  doc.rect(38, y, 766, 22).fill('#1a1a2e')
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7)
  cell(doc, 'ITEM', 44, y + 7, 160)
  cell(doc, 'CLASSIFICATION', 204, y + 7, 180)
  cell(doc, 'OPENING', 390, y + 7, 60, 'right')
  cell(doc, 'IN', 454, y + 7, 54, 'right')
  cell(doc, 'OUT', 512, y + 7, 54, 'right')
  cell(doc, 'CLOSING', 570, y + 7, 62, 'right')
  cell(doc, 'DRIFT', 636, y + 7, 55, 'right')
  cell(doc, 'VALUE', 695, y + 7, 100, 'right')
  doc.y = y + 22
}

function drawBalance(doc: PDFKit.PDFDocument, row: PeriodBalance) {
  const y = doc.y + 6
  const unit = row.base_unit || row.unit
  doc.fillColor('#1a1a2e').font('Helvetica-Bold').fontSize(7.8)
  cell(doc, normalizeDisplayNomenclature(row.canonical_name || row.item_name), 44, y, 155)
  doc.fillColor('#667085').font('Helvetica').fontSize(6.5)
  cell(doc, row.sku || 'No SKU', 44, y + 11, 155)
  doc.fillColor('#344054').fontSize(7)
  cell(doc, inventoryBreadcrumb(row), 204, y, 180)
  cell(doc, quantity(row.opening, unit), 390, y, 60, 'right')
  cell(doc, quantity(row.quantity_in, unit), 454, y, 54, 'right')
  cell(doc, quantity(row.quantity_out, unit), 512, y, 54, 'right')
  doc.font('Helvetica-Bold')
  cell(doc, quantity(row.closing, unit), 570, y, 62, 'right')
  doc.fillColor(Math.abs(row.drift) > 0.001 ? '#B54708' : '#98A2B3').font('Helvetica')
  cell(doc, Math.abs(row.drift) > 0.001 ? number(row.drift) : '—', 636, y, 55, 'right')
  doc.fillColor('#344054')
  cell(doc, `KSh ${number(row.value_ksh)}`, 695, y, 100, 'right')
  doc.moveTo(44, y + 27).lineTo(795, y + 27).strokeColor('#EAECF0').stroke()
  doc.y = y + 28
}

function ledgerHeader(doc: PDFKit.PDFDocument) {
  const y = doc.y
  doc.rect(38, y, 766, 22).fill('#1a1a2e')
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7)
  cell(doc, 'DATE', 44, y + 7, 65)
  cell(doc, 'SOURCE DOCUMENT', 112, y + 7, 160)
  cell(doc, 'REFERENCE / BATCH', 276, y + 7, 160)
  cell(doc, 'IN', 440, y + 7, 70, 'right')
  cell(doc, 'OUT', 514, y + 7, 70, 'right')
  cell(doc, 'BALANCE', 588, y + 7, 80, 'right')
  cell(doc, 'ACTIONED BY', 674, y + 7, 120)
  doc.y = y + 22
}

function drawLedgerRow(doc: PDFKit.PDFDocument, row: StockCardRow) {
  const y = doc.y + 6
  doc.fillColor('#344054').font('Helvetica').fontSize(7)
  cell(doc, row.movement_date, 44, y, 65)
  cell(doc, row.source_document_type || row.source, 112, y, 158)
  doc.fillColor('#667085').fontSize(6.5)
  cell(doc, [row.reference, row.batch_number && `batch ${row.batch_number}`].filter(Boolean).join(' · ') || '—', 276, y, 158)
  doc.fillColor('#027A48').font('Helvetica-Bold').fontSize(7)
  cell(doc, row.quantity_in ? number(row.quantity_in) : '—', 440, y, 70, 'right')
  doc.fillColor('#B42318')
  cell(doc, row.quantity_out ? number(row.quantity_out) : '—', 514, y, 70, 'right')
  doc.fillColor('#1a1a2e')
  cell(doc, number(row.running_balance), 588, y, 80, 'right')
  doc.fillColor('#667085').font('Helvetica').fontSize(6.5)
  cell(doc, row.actioned_by || '—', 674, y, 120)
  doc.moveTo(44, y + 21).lineTo(795, y + 21).strokeColor('#EAECF0').stroke()
  doc.y = y + 22
}

function cell(doc: PDFKit.PDFDocument, value: string, x: number, y: number, width: number, align: 'left' | 'right' = 'left') {
  doc.text(value, x, y, { width, align, lineBreak: false, ellipsis: true })
}

function footer(doc: PDFKit.PDFDocument, pageNumber: number) {
  doc.fillColor('#98A2B3').font('Helvetica').fontSize(7)
    .text(`Page ${pageNumber} | Opening + In - Out = Closing | Generated from the movement ledger`, 38, 536, { width: 766, align: 'center' })
}

function quantity(value: number, unit: string) {
  return `${number(value)} ${unit}`
}

function number(value: number) {
  return Number(value).toLocaleString('en-KE', { maximumFractionDigits: 3 })
}

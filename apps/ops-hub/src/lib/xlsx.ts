// Server-only module (pulls in exceljs). Import only from route handlers /
// server components — never a client component.
import ExcelJS from 'exceljs'

/**
 * Server-side Excel read/write. Uses exceljs (dates come back as JS `Date`, so
 * no manual serial-number decoding is needed). Import parsing runs here, on the
 * server, never in the browser (execution rule 15).
 */

export type CellValue = string | number | boolean | Date | null

export interface SheetData {
  name: string
  /** rows[rowIndex][colIndex], 0-indexed, includes blank cells/rows to preserve layout. */
  rows: CellValue[][]
  rowCount: number
  colCount: number
}

export interface WorkbookData {
  sheets: SheetData[]
}

function normalizeCell(value: ExcelJS.CellValue): CellValue {
  if (value == null) return null
  // Corrupt Excel serials can deserialize to an Invalid Date — drop to null so
  // downstream never calls toISOString() on them (see workbook analysis §1.5).
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value
  // Rich text
  if (typeof value === 'object') {
    const v = value as unknown as Record<string, unknown>
    if (Array.isArray(v['richText'])) {
      return (v['richText'] as Array<{ text?: string }>).map((r) => r.text ?? '').join('')
    }
    if ('text' in v && (typeof v['text'] === 'string' || typeof v['text'] === 'number')) {
      return String(v['text'])
    }
    if ('result' in v) {
      const r = v['result']
      if (r instanceof Date) return Number.isNaN(r.getTime()) ? null : r
      if (typeof r === 'number' || typeof r === 'string' || typeof r === 'boolean') return r
      return null
    }
    if ('error' in v) return null
    if ('hyperlink' in v && typeof v['hyperlink'] === 'string') return v['hyperlink']
  }
  return null
}

/**
 * Read an .xlsx buffer into a normalized grid per sheet. `maxRowsPerSheet` caps
 * memory for pathologically large sheets (e.g. 28k+ rows); 0 = unlimited.
 */
export async function readWorkbook(
  buffer: Buffer | ArrayBuffer,
  opts: { maxRowsPerSheet?: number } = {},
): Promise<WorkbookData> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as ArrayBuffer)
  const cap = opts.maxRowsPerSheet ?? 0
  const sheets: SheetData[] = []
  wb.eachSheet((ws) => {
    const rows: CellValue[][] = []
    let colCount = 0
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      if (cap && rowNumber > cap) return
      const cells: CellValue[] = []
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cells[colNumber - 1] = normalizeCell(cell.value)
      })
      if (cells.length > colCount) colCount = cells.length
      // exceljs row numbers are 1-based; keep them aligned to source rows.
      rows[rowNumber - 1] = cells
    })
    sheets.push({ name: ws.name, rows, rowCount: rows.length, colCount })
  })
  return { sheets }
}

/** Lightweight sheet listing (names + dimensions) without holding all cells. */
export async function listSheets(buffer: Buffer | ArrayBuffer): Promise<Array<{ name: string; rowCount: number; colCount: number }>> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as ArrayBuffer)
  const out: Array<{ name: string; rowCount: number; colCount: number }> = []
  wb.eachSheet((ws) => out.push({ name: ws.name, rowCount: ws.rowCount, colCount: ws.columnCount }))
  return out
}

// ── Writing / export ─────────────────────────────────────────────────────────

export interface ExportColumn {
  header: string
  key: string
  width?: number
  /** 'money' right-aligns and formats to 2dp; 'date' formats ISO. */
  format?: 'money' | 'date' | 'text'
}

export interface ExportSheet {
  name: string
  columns: ExportColumn[]
  rows: Array<Record<string, unknown>>
  /** Optional title row above the header (e.g. "Ar-Rayyan — Student Statement"). */
  title?: string
  /** Optional total row appended and bolded. */
  totalRow?: Record<string, unknown>
}

/**
 * Build a styled .xlsx buffer. Used for both the normalized (machine-readable)
 * export and the accountant "workbook-style" export (Debit/Credit/Balance).
 */
export async function buildWorkbook(sheets: ExportSheet[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'OneCore Group Ops Hub'
  wb.created = new Date()
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31) || 'Sheet1')
    let headerRowIdx = 1
    if (s.title) {
      ws.mergeCells(1, 1, 1, Math.max(1, s.columns.length))
      const t = ws.getCell(1, 1)
      t.value = s.title
      t.font = { bold: true, size: 13 }
      headerRowIdx = 2
    }
    ws.columns = s.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }))
    // exceljs puts headers on row 1 by default; if we have a title, shift.
    if (s.title) {
      ws.spliceRows(1, 0, []) // make room; header now on row 2
      ws.getRow(1).getCell(1).value = s.title
      ws.getRow(1).getCell(1).font = { bold: true, size: 13 }
      ws.mergeCells(1, 1, 1, Math.max(1, s.columns.length))
    }
    const headerRow = ws.getRow(headerRowIdx)
    headerRow.font = { bold: true }
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } }
      cell.border = { bottom: { style: 'thin' } }
    })
    for (const r of s.rows) {
      const row = ws.addRow(r)
      s.columns.forEach((c, i) => {
        if (c.format === 'money') {
          row.getCell(i + 1).numFmt = '#,##0.00'
          row.getCell(i + 1).alignment = { horizontal: 'right' }
        }
      })
    }
    if (s.totalRow) {
      const row = ws.addRow(s.totalRow)
      row.font = { bold: true }
      s.columns.forEach((c, i) => {
        if (c.format === 'money') {
          row.getCell(i + 1).numFmt = '#,##0.00'
          row.getCell(i + 1).alignment = { horizontal: 'right' }
        }
      })
    }
  }
  const out = await wb.xlsx.writeBuffer()
  return Buffer.from(out)
}

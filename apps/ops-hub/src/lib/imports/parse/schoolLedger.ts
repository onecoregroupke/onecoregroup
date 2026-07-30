import { parseMoney, roundMoney } from '../../money'
import type { WorkbookData, CellValue } from '../../xlsx'
import type { ParsedRow } from '../framework'
import type { School, SchoolLedgerEntryType } from '@ocg/db'

/**
 * Pure parser for Rayyan / Rhythms student fee ledgers (no IO — unit tested).
 * Encodes the workbook rules from docs/finance-upgrade/01-workbook-analysis.md.
 */

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
// Returns a usable Date or null (an Invalid Date from a corrupt serial → null).
const asDate = (v: CellValue): Date | null => (v instanceof Date && !Number.isNaN(v.getTime()) ? v : null)
const asText = (v: CellValue): string => {
  const d = asDate(v)
  if (d) return d.toISOString().slice(0, 10)
  return v == null || v instanceof Date ? '' : String(v).trim()
}

const HEADER_ALIASES: Record<string, string> = {
  'adm no': 'adm', 'adm': 'adm', 'admission no': 'adm',
  'name': 'name', 'date': 'date', 'term': 'term',
  'rct no': 'rct', 'rct': 'rct', 'receipt': 'rct',
  'mpesa transaction code': 'mpesa', 'mpesa': 'mpesa', 'transaction code': 'mpesa',
  'category': 'category', 'details': 'details',
  'dr': 'dr', 'cr': 'cr', 'balance': 'balance', 'bal': 'balance',
  'comment': 'comment', 'notes': 'comment',
}

export function admissionPattern(school: School): RegExp {
  if (school === 'rayyan') return /^\d{3,4}\s*\/\s*\d{1,3}\s*\/\s*ar-(dc|ph)/i
  return /^([a-z]{0,3}\/)?\d{1,4}\s*\/\s*\d{2}$/i
}

export function looksLikeAdmission(value: string, school: School): boolean {
  const v = value.trim()
  if (!v || v.length > 24) return false
  return admissionPattern(school).test(v)
}

function detectHeader(rows: CellValue[][]): { headerRow: number; cols: Record<string, number> } | null {
  for (let r = 0; r < Math.min(rows.length, 8); r++) {
    const row = rows[r] ?? []
    const cols: Record<string, number> = {}
    row.forEach((cell, i) => {
      const key = HEADER_ALIASES[norm(cell)]
      if (key && !(key in cols)) cols[key] = i
    })
    if (('dr' in cols || 'cr' in cols) && ('details' in cols || 'adm' in cols)) return { headerRow: r, cols }
  }
  return null
}

export const isTotalRow = (details: string) => /\btotal\b|grand total|subtotal/i.test(details)

function rawOf(row: CellValue[]): Record<string, unknown> {
  const o: Record<string, unknown> = {}
  row.forEach((c, i) => { const d = asDate(c); o[`c${i}`] = d ? d.toISOString() : c instanceof Date ? null : c })
  return o
}

export function parseSchoolLedger(wb: WorkbookData, school: School, selectedSheets?: string[]): ParsedRow[] {
  const out: ParsedRow[] = []
  for (const sheet of wb.sheets) {
    if (selectedSheets && !selectedSheets.includes(sheet.name)) continue
    if (/debt/i.test(sheet.name)) continue // debtor/completion sheets handled elsewhere
    const rows = sheet.rows
    const detected = detectHeader(rows)
    if (!detected) continue
    const { headerRow, cols } = detected
    const sectionFromSheet = sheet.name.replace(/\s+fees?$/i, '').trim()

    let curAdm = ''
    let curName = ''
    let prevBlank = false

    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r] ?? []
      const cell = (key: string): CellValue => (key in cols ? row[cols[key]] ?? null : null)
      const allEmpty = row.every((c) => c == null || asText(c) === '')
      if (allEmpty) { prevBlank = true; continue }

      const admRaw = asText(cell('adm'))
      const nameRaw = asText(cell('name'))
      const details = asText(cell('details'))
      const dateCell = cell('date')
      const drRaw = cell('dr')
      const crRaw = cell('cr')

      const admIsId = looksLikeAdmission(admRaw, school)
      const idRow = admIsId && (nameRaw || details) && dateCell == null && parseMoney(drRaw) === 0 && parseMoney(crRaw) === 0
      if (admIsId && (idRow || prevBlank || !curAdm)) {
        curAdm = admRaw.replace(/\s+/g, '')
        curName = nameRaw || (school === 'rhythms' ? details : '') || curName
        prevBlank = false
        if (idRow || (parseMoney(drRaw) === 0 && parseMoney(crRaw) === 0 && !dateCell)) {
          out.push({ sheet_name: sheet.name, source_row: r + 1, raw: rawOf(row), mapped: { school, student_admission_no: curAdm, student_name: curName }, record_kind: 'student' })
          continue
        }
      }
      prevBlank = false

      if (!details && /transferred|went to|no records|signed/i.test(nameRaw)) {
        out.push({ sheet_name: sheet.name, source_row: r + 1, raw: rawOf(row), mapped: { note: nameRaw }, record_kind: 'skip' })
        continue
      }

      if (isTotalRow(details) || isTotalRow(asText(cell('category')))) {
        out.push({ sheet_name: sheet.name, source_row: r + 1, raw: rawOf(row), mapped: {}, record_kind: 'subtotal' })
        continue
      }

      const dr = roundMoney(parseMoney(drRaw))
      const cr = roundMoney(parseMoney(crRaw))
      if (dr === 0 && cr === 0) {
        out.push({ sheet_name: sheet.name, source_row: r + 1, raw: rawOf(row), mapped: {}, record_kind: 'skip' })
        continue
      }

      const entryDate = asDate(dateCell)?.toISOString().slice(0, 10) ?? ''
      const term = asText(cell('term'))
      const academicYear = /(\d{4})/.test(term) ? RegExp.$1 : entryDate ? entryDate.slice(0, 4) : ''
      const categoryLabel = asText(cell('category')) || details || sectionFromSheet
      const base = {
        school,
        student_admission_no: curAdm,
        student_name: curName,
        section: /daycare/i.test(sheet.name) ? 'daycare' : /playhouse/i.test(sheet.name) ? 'playhouse' : sectionFromSheet,
        category_label: categoryLabel,
        description: details,
        entry_date: entryDate,
        term,
        academic_year: academicYear,
        receipt_no: asText(cell('rct')),
        mpesa_code: asText(cell('mpesa')),
        source_balance: cell('balance') != null ? roundMoney(parseMoney(cell('balance'))) : null,
        comment: asText(cell('comment')),
      }
      const messages: ParsedRow['messages'] = []
      if (!curAdm) messages.push({ level: 'warning', text: 'No admission number resolved for this row' })
      if (!entryDate && (dr > 0 || cr > 0)) messages.push({ level: 'warning', text: 'Missing/invalid transaction date' })

      if (dr > 0) {
        out.push({ sheet_name: sheet.name, source_row: r + 1, raw: rawOf(row), record_kind: 'charge', messages,
          mapped: { ...base, entry_type: 'charge' as SchoolLedgerEntryType, amount_ksh: dr } })
      }
      if (cr > 0) {
        // Same source row as the charge; uniqueness is on (…row, entry_type).
        out.push({ sheet_name: sheet.name, source_row: r + 1, raw: rawOf(row), record_kind: 'payment', messages,
          mapped: { ...base, entry_type: 'payment' as SchoolLedgerEntryType, amount_ksh: cr, method: base.mpesa_code ? 'mpesa' : '' } })
      }
    }
  }
  return out
}

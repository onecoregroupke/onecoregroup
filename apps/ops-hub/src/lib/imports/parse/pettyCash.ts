import { parseMoney, roundMoney } from '../../money'
import type { WorkbookData, CellValue } from '../../xlsx'
import type { ParsedRow } from '../framework'

/**
 * Pure parser for Wallace-style petty cash workbooks (no IO — unit tested).
 * Handles stacked custodian/day blocks, per-block column-role detection (columns
 * shift between blocks), the ZIIDI secondary charge, and TOTAL-row skipping.
 */

const asDate = (v: CellValue): Date | null => (v instanceof Date && !Number.isNaN(v.getTime()) ? v : null)
const asText = (v: CellValue): string => {
  const d = asDate(v)
  if (d) return d.toISOString().slice(0, 10)
  return v == null || v instanceof Date ? '' : String(v).trim()
}
const isNum = (v: CellValue): boolean => v != null && v !== '' && Number.isFinite(parseMoney(v)) && !(v instanceof Date) && /[0-9]/.test(String(v))
const isDate = (v: CellValue): boolean => asDate(v) !== null

interface BlockRoles {
  incomeAmtCol: number
  incomeSrcCol: number
  ziidiCol: number
  totalCol: number
  payeeCol: number
  expenseAmtCol: number
  chargeCol: number
}

function detectBlockRoles(block: CellValue[][], headerRowIdx: number): BlockRoles {
  const header = block[headerRowIdx] ?? []
  const idxOf = (label: string) => header.findIndex((c) => asText(c).toUpperCase() === label)
  const incomeAmtCol = Math.max(0, idxOf('INCOME'))
  const incomeSrcCol = incomeAmtCol + 1
  const ziidiCol = idxOf('ZIIDI')
  const totalCol = idxOf('TOTAL')

  const textCounts = new Map<number, number>()
  const numCounts = new Map<number, number>()
  for (let r = headerRowIdx + 1; r < block.length; r++) {
    const row = block[r] ?? []
    row.forEach((c, i) => {
      if (i <= incomeSrcCol || i === ziidiCol || i === totalCol) return
      if (isNum(c)) numCounts.set(i, (numCounts.get(i) ?? 0) + 1)
      else if (asText(c)) textCounts.set(i, (textCounts.get(i) ?? 0) + 1)
    })
  }
  let payeeCol = -1
  let best = 0
  for (const [i, n] of textCounts) if (n > best) { best = n; payeeCol = i }
  let expenseAmtCol = -1
  if (payeeCol > 0) {
    for (let i = payeeCol - 1; i > incomeSrcCol; i--) { if ((numCounts.get(i) ?? 0) > 0) { expenseAmtCol = i; break } }
  }
  let chargeCol = -1
  for (let i = payeeCol + 1; i < (block[headerRowIdx]?.length ?? 0) + 2; i++) {
    if (i === ziidiCol || i === totalCol) continue
    if ((numCounts.get(i) ?? 0) > 0) { chargeCol = i; break }
  }
  return { incomeAmtCol, incomeSrcCol, ziidiCol, totalCol, payeeCol, expenseAmtCol, chargeCol }
}

function rawOf(row: CellValue[]): Record<string, unknown> {
  const o: Record<string, unknown> = {}
  row.forEach((c, i) => { const d = asDate(c); o[`c${i}`] = d ? d.toISOString() : c instanceof Date ? null : c })
  return o
}

export function parsePettyCash(wb: WorkbookData, selectedSheets?: string[]): ParsedRow[] {
  const out: ParsedRow[] = []
  for (const sheet of wb.sheets) {
    if (selectedSheets && !selectedSheets.includes(sheet.name)) continue
    const rows = sheet.rows

    const blocks: Array<{ start: number; rows: CellValue[][] }> = []
    let cur: CellValue[][] = []
    let startIdx = 0
    rows.forEach((row, i) => {
      const blank = !row || row.every((c) => c == null || asText(c) === '')
      if (blank) {
        if (cur.length) { blocks.push({ start: startIdx, rows: cur }); cur = [] }
      } else {
        if (!cur.length) startIdx = i
        cur.push(row)
      }
    })
    if (cur.length) blocks.push({ start: startIdx, rows: cur })

    for (const block of blocks) {
      const headerRowIdx = block.rows.findIndex((row) => row.some((c) => asText(c).toUpperCase() === 'INCOME'))
      const first = block.rows[0] ?? []
      const dateCell = first.find(isDate)
      const blockDate = asDate(dateCell ?? null)?.toISOString().slice(0, 10) ?? ''
      if (headerRowIdx < 0) continue
      const roles = detectBlockRoles(block.rows, headerRowIdx)

      for (let r = headerRowIdx + 1; r < block.rows.length; r++) {
        const row = block.rows[r] ?? []
        const srcRow = block.start + r + 1
        const firstCell = asText(row[0]).toUpperCase()
        if (firstCell === 'TOTAL') {
          out.push({ sheet_name: sheet.name, source_row: srcRow, raw: rawOf(row), mapped: {}, record_kind: 'subtotal' })
          continue
        }
        if (row.every((c) => c == null || asText(c) === '')) continue

        const incomeAmt = roundMoney(parseMoney(row[roles.incomeAmtCol]))
        const incomeSrc = asText(row[roles.incomeSrcCol])
        const payee = roles.payeeCol >= 0 ? asText(row[roles.payeeCol]) : ''
        const expenseAmt = roles.expenseAmtCol >= 0 ? roundMoney(parseMoney(row[roles.expenseAmtCol])) : 0
        const charge = roles.chargeCol >= 0 ? roundMoney(parseMoney(row[roles.chargeCol])) : 0
        const ziidi = roles.ziidiCol >= 0 ? roundMoney(parseMoney(row[roles.ziidiCol])) : 0

        // A single workbook row may carry BOTH an income entry (cols B/C) and an
        // expense entry (payee cols) — emit each independently.
        const hasExpense = Boolean(payee) || expenseAmt > 0
        const hasIncome = incomeAmt > 0
        if (hasIncome) {
          out.push({
            sheet_name: sheet.name, source_row: srcRow, raw: rawOf(row), record_kind: 'petty-income',
            mapped: { entry_kind: 'income', transaction_date: blockDate, cash_received_ksh: incomeAmt, source_of_funds: incomeSrc },
          })
        }
        if (hasExpense) {
          out.push({
            sheet_name: sheet.name, source_row: srcRow, raw: rawOf(row), record_kind: 'petty-expense',
            mapped: {
              entry_kind: 'expense', transaction_date: blockDate, payee,
              expense_amount_ksh: expenseAmt, transaction_charge_ksh: charge,
              secondary_charge_ksh: ziidi, secondary_charge_label: ziidi ? 'ZIIDI' : '',
              description: payee,
            },
            messages: expenseAmt === 0 && payee ? [{ level: 'warning', text: 'Expense amount not detected for this payee' }] : [],
          })
        }
        if (!hasIncome && !hasExpense) {
          out.push({ sheet_name: sheet.name, source_row: srcRow, raw: rawOf(row), mapped: {}, record_kind: 'skip' })
        }
      }
    }
  }
  return out
}

import { sumMoney, roundMoney } from './money'
import type { SchoolLedgerEntryRow } from '@ocg/db'

/**
 * Pure student-account balance derivation (no IO — unit tested). Balances are
 * ALWAYS derived from ledger entries; the workbook BALANCE column is audit-only.
 *
 * Convention (documented once, applied everywhere):
 *   charge / opening_balance / refund → increase amount due (debit, +)
 *   payment / write_off               → decrease amount due (credit, −)
 *   adjustment                        → signed by the amount's sign
 *   reversal                          → 0 marker; reversed original excluded via state
 *   POSITIVE balance = owed (debtor). NEGATIVE = credit / overpaid.
 */
export function signedAmount(entry: Pick<SchoolLedgerEntryRow, 'entry_type' | 'amount_ksh'>): number {
  const a = Number(entry.amount_ksh) || 0
  switch (entry.entry_type) {
    case 'charge':
    case 'opening_balance':
    case 'refund':
      return a
    case 'payment':
    case 'write_off':
      return -a
    case 'adjustment':
      return a
    case 'reversal':
      return 0
    default:
      return 0
  }
}

export interface StudentAccountSummary {
  postedBalance: number
  draftBalance: number
  totalCharges: number
  totalPayments: number
  byCategory: Array<{ key: string; label: string; balance: number; charged: number; paid: number }>
  byYear: Array<{ year: string; balance: number; charged: number; paid: number }>
  entryCount: number
}

export function summariseStudentAccount(entries: SchoolLedgerEntryRow[]): StudentAccountSummary {
  const posted = entries.filter((e) => e.state === 'posted')
  const drafts = entries.filter((e) => e.state === 'draft')
  const postedBalance = sumMoney(posted.map(signedAmount))
  const draftBalance = sumMoney(drafts.map(signedAmount))
  const totalCharges = sumMoney(posted.filter((e) => signedAmount(e) > 0).map((e) => Math.abs(signedAmount(e))))
  const totalPayments = sumMoney(posted.filter((e) => signedAmount(e) < 0).map((e) => Math.abs(signedAmount(e))))

  const catMap = new Map<string, { key: string; label: string; charged: number; paid: number; balance: number }>()
  const yearMap = new Map<string, { year: string; charged: number; paid: number; balance: number }>()
  for (const e of posted) {
    const s = signedAmount(e)
    const catKey = e.category_id || e.category_label || 'uncategorised'
    const cat = catMap.get(catKey) ?? { key: catKey, label: e.category_label || e.category_id || 'Uncategorised', charged: 0, paid: 0, balance: 0 }
    cat.balance = roundMoney(cat.balance + s)
    if (s > 0) cat.charged = roundMoney(cat.charged + s)
    else cat.paid = roundMoney(cat.paid - s)
    catMap.set(catKey, cat)

    const yr = e.academic_year || (e.entry_date ? e.entry_date.slice(0, 4) : 'unknown')
    const y = yearMap.get(yr) ?? { year: yr, charged: 0, paid: 0, balance: 0 }
    y.balance = roundMoney(y.balance + s)
    if (s > 0) y.charged = roundMoney(y.charged + s)
    else y.paid = roundMoney(y.paid - s)
    yearMap.set(yr, y)
  }
  return {
    postedBalance,
    draftBalance,
    totalCharges,
    totalPayments,
    byCategory: [...catMap.values()].sort((a, b) => a.label.localeCompare(b.label)),
    byYear: [...yearMap.values()].sort((a, b) => a.year.localeCompare(b.year)),
    entryCount: entries.length,
  }
}

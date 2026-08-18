import { db } from './serverClient'
import { scopedBrandIds } from './stockCards'
import type { QbExpectedEntryRow, QbAccountMapRow, QuickbooksTransactionRow } from '@ocg/db'

// =============================================================================
// QUICKBOOKS RECONCILIATION.
//
// The operator's insight, and the reason this works with no export in hand:
// the manual forms produce the very figures that are keyed into QuickBooks. So
// the problem is not "wait for an export to learn our shape" — it is "project
// our own documents into QuickBooks's shape now, and compare two lists when the
// export lands".
//
// `qb_expected_entries` (migration 066) is that projection: every posted
// invoice, payment, goods receipt and petty-cash transaction, rendered as a
// date + document number + party + amount + tax. It is a VIEW, so it cannot
// drift from the documents behind it.
// =============================================================================

export interface ExpectedFilter {
  allowed: string[] | null
  brandId?: string
  from?: string
  to?: string
  eventType?: string
  limit?: number
}

export async function listExpectedEntries(filter: ExpectedFilter): Promise<QbExpectedEntryRow[]> {
  const brands = scopedBrandIds(filter.allowed, filter.brandId)
  let q = db().from('qb_expected_entries').select('*')
    .order('entry_date', { ascending: false })
    .limit(filter.limit ?? 500)
  if (brands !== null) q = q.in('brand_id', brands)
  if (filter.from) q = q.gte('entry_date', filter.from)
  if (filter.to) q = q.lte('entry_date', filter.to)
  if (filter.eventType) q = q.eq('event_type', filter.eventType)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return ((data as QbExpectedEntryRow[] | null) ?? []).map((r) => ({
    ...r,
    amount_ksh: Number(r.amount_ksh ?? 0),
    tax_ksh: Number(r.tax_ksh ?? 0),
  }))
}

export async function listAccountMap(): Promise<QbAccountMapRow[]> {
  const { data } = await db().from('qb_account_map').select('*').eq('active', true).order('event_type')
  return (data as QbAccountMapRow[] | null) ?? []
}

export async function listImportedTransactions(limit = 500): Promise<QuickbooksTransactionRow[]> {
  const { data } = await db().from('quickbooks_transactions').select('*')
    .order('transaction_date', { ascending: false }).limit(limit)
  return (data as QuickbooksTransactionRow[] | null) ?? []
}

/** What each event type contributes, and how much of it is still unreconciled. */
export interface ExpectedSummary {
  eventType: string
  entries: number
  amountKsh: number
  taxKsh: number
  reconciled: number
  unreconciled: number
}

export function summariseExpected(rows: QbExpectedEntryRow[]): ExpectedSummary[] {
  const byType = new Map<string, ExpectedSummary>()
  for (const r of rows) {
    const row = byType.get(r.event_type) ?? {
      eventType: r.event_type, entries: 0, amountKsh: 0, taxKsh: 0, reconciled: 0, unreconciled: 0,
    }
    row.entries += 1
    row.amountKsh += r.amount_ksh
    row.taxKsh += r.tax_ksh
    if (r.reconciliation_status === 'reconciled') row.reconciled += 1
    else row.unreconciled += 1
    byType.set(r.event_type, row)
  }
  return [...byType.values()]
    .map((r) => ({ ...r, amountKsh: Number(r.amountKsh.toFixed(2)), taxKsh: Number(r.taxKsh.toFixed(2)) }))
    .sort((a, b) => b.amountKsh - a.amountKsh)
}

/**
 * Candidate matches between our documents and an imported QuickBooks export.
 *
 * §4's rule is absolute: a match may NOT be accepted on amount alone. So a
 * candidate must agree on at least two signals, and the signals it agreed on
 * travel with it — the database CHECK re-enforces this at write time, so a
 * caller that ignores the advice still cannot record a single-signal match.
 */
export interface MatchCandidate {
  expected: QbExpectedEntryRow
  qb: QuickbooksTransactionRow
  basis: string[]
  confidence: number
  differenceKsh: number
}

const norm = (s: string) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

export function proposeMatches(
  expected: QbExpectedEntryRow[],
  imported: QuickbooksTransactionRow[],
  toleranceKsh = 1,
): MatchCandidate[] {
  const out: MatchCandidate[] = []

  for (const e of expected) {
    if (e.reconciliation_status === 'reconciled') continue
    for (const q of imported) {
      if (q.match_state === 'reconciled' || q.match_state === 'rejected') continue

      const basis: string[] = []
      const diff = Number((e.amount_ksh - Number(q.amount_ksh ?? 0)).toFixed(2))

      if (Math.abs(diff) <= toleranceKsh) basis.push('amount')
      if (e.entry_date && q.transaction_date && e.entry_date === q.transaction_date) basis.push('date')
      if (e.doc_number && norm(e.doc_number) === norm(q.qb_doc_number)) basis.push('reference')
      if (e.doc_number && norm(e.doc_number) === norm(q.reference)) basis.push('reference')
      if (e.mpesa_code && norm(e.mpesa_code) === norm(q.mpesa_code)) basis.push('mpesa_code')
      if (e.party_name && (norm(e.party_name) === norm(q.customer_name) || norm(e.party_name) === norm(q.supplier_name))) {
        basis.push('party')
      }

      const unique = [...new Set(basis)]
      // TWO agreeing signals minimum, and amount alone is never enough.
      if (unique.length < 2) continue
      if (unique.length === 2 && unique.includes('amount') && unique.includes('date')) {
        // Date + amount is the weakest admissible pair; keep it but score it low
        // so a reviewer sees it as a suggestion rather than a certainty.
      }

      const weight: Record<string, number> = {
        mpesa_code: 45, reference: 35, amount: 25, party: 20, date: 15,
      }
      const confidence = Math.min(99, unique.reduce((s, b) => s + (weight[b] ?? 0), 0))

      out.push({ expected: e, qb: q, basis: unique, confidence, differenceKsh: diff })
    }
  }

  // Best candidate first, and only the best few per expected entry.
  out.sort((a, b) => b.confidence - a.confidence)
  const seen = new Map<string, number>()
  return out.filter((c) => {
    const n = seen.get(c.expected.entity_id) ?? 0
    if (n >= 3) return false
    seen.set(c.expected.entity_id, n + 1)
    return true
  })
}

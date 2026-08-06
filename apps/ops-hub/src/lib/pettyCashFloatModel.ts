// Petty-cash float cycles and QuickBooks reconciliation
// (addendum §§5–14, §§2–4). Pure — unit-tested.

import { addMoney } from './money'

// ─── Float balance (§8) ─────────────────────────────────────────────────────

export interface FloatFunding {
  opening_amount: number
  balance_brought_forward: number
  additional_funding: number
}

export interface FloatActivity {
  expenses: number
  transaction_charges: number
  refunds: number
  adjustments: number
}

/**
 * §8's stated formula, implemented exactly:
 *
 *   calculated closing = opening + carried-forward + additional approved funding
 *                        + refunds − approved expenses − transaction charges
 *                        ± approved adjustments
 *
 * §7 is why charges are a separate input: the Iceland sheets record the
 * transaction charge apart from the expense, and folding them together would
 * lose a distinction finance already maintains on paper.
 */
export function calculatedClosingBalance(funding: FloatFunding, activity: FloatActivity): number {
  const available = addMoney(
    addMoney(funding.opening_amount, funding.balance_brought_forward),
    funding.additional_funding,
  )
  return addMoney(
    addMoney(available, addMoney(activity.refunds, activity.adjustments)),
    -addMoney(activity.expenses, activity.transaction_charges),
  )
}

export function totalAvailable(funding: FloatFunding): number {
  return addMoney(
    addMoney(funding.opening_amount, funding.balance_brought_forward),
    funding.additional_funding,
  )
}

/** The cash impact of one transaction: the expense plus its separate charges. */
export function transactionCashImpact(t: {
  expense_amount: number
  transaction_charge?: number
  withdrawal_charge?: number
  secondary_charge?: number
}): number {
  return addMoney(
    t.expense_amount,
    addMoney(
      addMoney(t.transaction_charge ?? 0, t.withdrawal_charge ?? 0),
      t.secondary_charge ?? 0,
    ),
  )
}

/** Variance between the calculated balance and the physically counted cash. */
export function floatVariance(calculated: number, physical: number | null): number | null {
  if (physical == null) return null
  return addMoney(physical, -calculated)
}

// ─── Closure (§9) ───────────────────────────────────────────────────────────

export interface FloatClosureCheck {
  calculatedBalance: number
  variance: number | null
  problems: string[]
  canClose: boolean
}

export interface ClosureInput {
  funding: FloatFunding
  activity: FloatActivity
  physicalBalance: number | null
  varianceExplanation: string
  transactionsMissingDocuments: number
  transactionsUnreconciled: number
  reviewedBy: string
  requireReconciliation?: boolean
}

/**
 * §9's closure gate. A float may not close with an unexplained variance, with
 * documents still outstanding, or without a finance review.
 */
export function checkFloatClosure(input: ClosureInput): FloatClosureCheck {
  const calculatedBalance = calculatedClosingBalance(input.funding, input.activity)
  const variance = floatVariance(calculatedBalance, input.physicalBalance)
  const problems: string[] = []

  if (input.transactionsMissingDocuments > 0) {
    problems.push(`${input.transactionsMissingDocuments} transaction(s) still missing supporting documents.`)
  }
  if (variance == null) {
    problems.push('The physical cash balance has not been recorded.')
  } else if (variance !== 0 && !input.varianceExplanation.trim()) {
    problems.push(`Variance of ${variance.toFixed(2)} must be explained before closure.`)
  }
  if (!input.reviewedBy.trim()) {
    problems.push('Finance review is required before a float can be closed.')
  }
  if (input.requireReconciliation && input.transactionsUnreconciled > 0) {
    problems.push(`${input.transactionsUnreconciled} transaction(s) not yet reconciled to QuickBooks.`)
  }

  return { calculatedBalance, variance, problems, canClose: problems.length === 0 }
}

// ─── Carry-forward (§10) ────────────────────────────────────────────────────

export type CarryForwardDecision = 'carried' | 'returned' | 'reimbursed' | 'written_off'

export interface NextFloatOpening {
  balance_brought_forward: number
  opening_amount: number
  additional_funding: number
  total_available: number
}

/**
 * §10: "Do not count the carried-forward amount twice."
 *
 * Only a 'carried' decision moves the previous balance into the next float.
 * Returned, reimbursed and written-off balances leave the cycle entirely — if
 * any of those also carried forward, the same cash would be counted in two
 * places, which is exactly the failure the addendum names.
 */
export function openNextFloat(input: {
  previousClosingBalance: number
  decision: CarryForwardDecision
  newFundingAmount: number
}): NextFloatOpening {
  const brought = input.decision === 'carried' ? input.previousClosingBalance : 0
  return {
    balance_brought_forward: brought,
    opening_amount: input.newFundingAmount,
    additional_funding: 0,
    total_available: addMoney(brought, input.newFundingAmount),
  }
}

// ─── Document completeness (§13) ────────────────────────────────────────────

export const DOCUMENT_TYPES = [
  'voucher', 'supplier_invoice', 'receipt', 'goods_received_note', 'delivery_note',
  'procurement_request', 'purchase_order', 'mpesa_confirmation', 'bank_confirmation',
  'approval', 'photo', 'other',
] as const
export type DocumentType = (typeof DOCUMENT_TYPES)[number]

export type DocumentStatus =
  | 'complete' | 'missing_invoice' | 'missing_receipt' | 'missing_grn'
  | 'missing_payment_reference' | 'awaiting_approval' | 'incomplete'

/** Default requirements by transaction kind (§13), overridable per brand. */
export const DEFAULT_DOCUMENT_RULES: Record<string, DocumentType[]> = {
  stock_purchase: ['procurement_request', 'supplier_invoice', 'delivery_note', 'goods_received_note', 'mpesa_confirmation'],
  service: ['supplier_invoice', 'approval', 'mpesa_confirmation'],
  transport: ['receipt', 'mpesa_confirmation'],
  general: ['receipt'],
}

export interface CompletenessResult {
  status: DocumentStatus
  missing: DocumentType[]
  complete: boolean
}

/**
 * §13: which documents are still outstanding.
 *
 * Note what this does NOT do: it never blocks recording. "Do not prevent
 * emergency operational recording when a document is temporarily missing, but
 * require a reason and track the outstanding document." So this reports, and
 * the caller records the reason.
 */
export function checkDocumentCompleteness(
  required: DocumentType[],
  present: DocumentType[],
): CompletenessResult {
  const have = new Set(present)
  const missing = required.filter((d) => !have.has(d))
  if (missing.length === 0) return { status: 'complete', missing: [], complete: true }

  // Report the most actionable single status, with the full list alongside.
  let status: DocumentStatus = 'incomplete'
  if (missing.includes('supplier_invoice')) status = 'missing_invoice'
  else if (missing.includes('goods_received_note')) status = 'missing_grn'
  else if (missing.includes('receipt')) status = 'missing_receipt'
  else if (missing.includes('mpesa_confirmation') || missing.includes('bank_confirmation')) status = 'missing_payment_reference'
  else if (missing.includes('approval')) status = 'awaiting_approval'

  return { status, missing, complete: false }
}

/** §12: the order a merged float packet is assembled in. */
export const PACKET_ORDER: DocumentType[] = [
  'voucher', 'supplier_invoice', 'receipt', 'goods_received_note', 'delivery_note',
  'mpesa_confirmation', 'bank_confirmation', 'approval', 'procurement_request',
  'purchase_order', 'photo', 'other',
]

export function sortPacketDocuments<T extends { document_type: string }>(docs: T[]): T[] {
  const rank = (t: string) => {
    const i = PACKET_ORDER.indexOf(t as DocumentType)
    return i === -1 ? PACKET_ORDER.length : i
  }
  return [...docs].sort((a, b) => rank(a.document_type) - rank(b.document_type))
}

// ─── QuickBooks matching (§4) ───────────────────────────────────────────────

export interface QbCandidate {
  transaction_date?: string | null
  amount: number
  reference?: string | null
  mpesa_code?: string | null
  supplier?: string | null
  customer?: string | null
  invoice_number?: string | null
}

export interface MatchScore {
  confidence: number
  basis: string[]
  /** §4: "Do not match solely by amount." */
  acceptable: boolean
}

const norm = (s?: string | null) => (s ?? '').trim().toLowerCase()

/**
 * Score an operational record against a QuickBooks transaction.
 *
 * `acceptable` is false whenever the only agreement is the amount — the
 * addendum forbids matching on amount alone, so a single-signal match can be
 * SUGGESTED for a human to look at but never auto-accepted.
 */
export function scoreQbMatch(op: QbCandidate, qb: QbCandidate): MatchScore {
  const basis: string[] = []
  let confidence = 0

  if (Math.abs(op.amount - qb.amount) < 0.005) { basis.push('amount'); confidence += 30 }
  if (op.transaction_date && qb.transaction_date) {
    if (op.transaction_date === qb.transaction_date) { basis.push('date'); confidence += 20 }
    else if (withinDays(op.transaction_date, qb.transaction_date, 3)) { basis.push('date_near'); confidence += 10 }
  }
  if (norm(op.mpesa_code) && norm(op.mpesa_code) === norm(qb.mpesa_code)) { basis.push('mpesa_code'); confidence += 35 }
  if (norm(op.reference) && norm(op.reference) === norm(qb.reference)) { basis.push('reference'); confidence += 25 }
  if (norm(op.invoice_number) && norm(op.invoice_number) === norm(qb.invoice_number)) { basis.push('invoice_number'); confidence += 25 }
  if (norm(op.supplier) && norm(op.supplier) === norm(qb.supplier)) { basis.push('supplier'); confidence += 15 }
  if (norm(op.customer) && norm(op.customer) === norm(qb.customer)) { basis.push('customer'); confidence += 15 }

  const amountOnly = basis.length === 1 && basis[0] === 'amount'
  return {
    confidence: Math.min(100, confidence),
    basis,
    acceptable: basis.length >= 2 && !amountOnly,
  }
}

function withinDays(a: string, b: string, days: number): boolean {
  const diff = Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`))
  return Number.isFinite(diff) && diff <= days * 86_400_000
}

/**
 * §4: split one QuickBooks transaction across operational records, or combine
 * several against one. Returns the unallocated remainder so a partial match is
 * visible rather than silently rounded away.
 */
export function allocateMatch(
  qbAmount: number,
  allocations: Array<{ amount: number }>,
): { allocated: number; remainder: number; fullyMatched: boolean; overAllocated: boolean } {
  const allocated = allocations.reduce((s, a) => addMoney(s, a.amount), 0)
  const remainder = addMoney(qbAmount, -allocated)
  return {
    allocated,
    remainder,
    fullyMatched: Math.abs(remainder) < 0.005,
    overAllocated: remainder < -0.005,
  }
}

export const RECONCILIATION_STATUSES = [
  'not_ready', 'ready', 'awaiting_import', 'suggested', 'matched',
  'partially_matched', 'difference', 'requires_review', 'reconciled', 'rejected', 'reversed',
] as const

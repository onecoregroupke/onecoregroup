// Procurement chain rules (§13, §14, §15). Pure + unit-tested — no I/O here.
//
// These are the integrity guarantees the paper process cannot make:
//   • a requester can never approve their own requisition
//   • approving a requisition moves no stock; only issuing does
//   • delivered = accepted + rejected, and only accepted quantity is stocked
//   • a document posts to stock exactly once

import { shouldStock } from './procurementModel'

// ─── Requisition lifecycle ──────────────────────────────────────────────────

export const REQUISITION_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under review' },
  { value: 'approved', label: 'Approved' },
  { value: 'partially_approved', label: 'Partially approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'ready_for_issue', label: 'Ready for issue' },
  { value: 'partially_issued', label: 'Partially issued' },
  { value: 'fully_issued', label: 'Fully issued' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const

export type RequisitionStatus = (typeof REQUISITION_STATUSES)[number]['value']

export function requisitionStatusLabel(value: string): string {
  return REQUISITION_STATUSES.find((s) => s.value === value)?.label ?? value
}

/** Statuses at which an approver may still act. */
export const APPROVABLE_REQUISITION_STATUSES = ['submitted', 'under_review'] as const

export function isRequisitionApprovable(status: string): boolean {
  return (APPROVABLE_REQUISITION_STATUSES as readonly string[]).includes(status)
}

export function isRequisitionEditable(status: string): boolean {
  return status === 'draft'
}

/**
 * A requester may never approve their own requisition (§13, §2). `allowSelf` is
 * the deliberate policy escape hatch and must be an explicit grant, never a
 * default.
 */
export function canApproveRequisition(input: {
  requestedByEmail: string
  approverEmail: string
  status: string
  allowSelfApproval?: boolean
}): { ok: boolean; reason?: string } {
  if (!isRequisitionApprovable(input.status)) {
    return { ok: false, reason: `A ${requisitionStatusLabel(input.status).toLowerCase()} requisition cannot be approved.` }
  }
  const sameperson =
    input.requestedByEmail.trim().toLowerCase() === input.approverEmail.trim().toLowerCase() &&
    input.requestedByEmail.trim() !== ''
  if (sameperson && !input.allowSelfApproval) {
    return { ok: false, reason: 'You cannot approve your own requisition.' }
  }
  return { ok: true }
}

export interface RequisitionLineTotals {
  requested: number
  approved: number
  issued: number
}

/**
 * Derive the requisition's status from its lines after an approval or issue.
 * Nothing here touches stock — that is the point.
 */
export function deriveRequisitionStatus(
  lines: RequisitionLineTotals[],
  stage: 'approval' | 'issue',
): RequisitionStatus {
  const totalRequested = lines.reduce((sum, l) => sum + l.requested, 0)
  const totalApproved = lines.reduce((sum, l) => sum + l.approved, 0)
  const totalIssued = lines.reduce((sum, l) => sum + l.issued, 0)

  if (stage === 'approval') {
    if (totalApproved <= 0) return 'rejected'
    if (totalApproved < totalRequested) return 'partially_approved'
    return 'approved'
  }

  if (totalIssued <= 0) return 'ready_for_issue'
  if (totalIssued < totalApproved) return 'partially_issued'
  return 'fully_issued'
}

// ─── Goods receipt quantities ───────────────────────────────────────────────

export interface ReceiptLineQuantities {
  quantity_ordered?: number
  quantity_delivered: number
  quantity_accepted: number
  quantity_rejected: number
}

/**
 * Delivered must split exactly into accepted + rejected. Over-delivery beyond
 * the order is allowed (suppliers do it) but is surfaced as a variance, never
 * silently stocked.
 */
export function validateReceiptLine(line: ReceiptLineQuantities): { ok: boolean; reason?: string } {
  const { quantity_delivered: delivered, quantity_accepted: accepted, quantity_rejected: rejected } = line
  if ([delivered, accepted, rejected].some((n) => !Number.isFinite(n) || n < 0)) {
    return { ok: false, reason: 'Quantities cannot be negative.' }
  }
  if (round2(accepted + rejected) !== round2(delivered)) {
    return {
      ok: false,
      reason: `Accepted (${accepted}) plus rejected (${rejected}) must equal delivered (${delivered}).`,
    }
  }
  return { ok: true }
}

export function receiptLineVariance(line: ReceiptLineQuantities): number {
  const ordered = line.quantity_ordered ?? 0
  return round2(line.quantity_delivered - ordered)
}

/**
 * The quantity that actually reaches inventory for a receipt line: accepted
 * quantity, and only when the line is stored rather than consumed on arrival.
 * Rejected and damaged goods never reach stock.
 */
export function stockableReceiptQuantity(line: ReceiptLineQuantities & { disposition: string }): number {
  if (!shouldStock(line.disposition)) return 0
  return Math.max(0, round2(line.quantity_accepted))
}

// ─── Goods issue quantities ─────────────────────────────────────────────────

export interface IssueLineQuantities {
  quantity_approved: number
  quantity_issued: number
  /** Stock on hand for this item at the moment of issue. */
  available?: number
}

/** Issued may never exceed what was approved, nor what is physically in stock. */
export function validateIssueLine(line: IssueLineQuantities): { ok: boolean; reason?: string } {
  if (!Number.isFinite(line.quantity_issued) || line.quantity_issued < 0) {
    return { ok: false, reason: 'Issued quantity cannot be negative.' }
  }
  if (line.quantity_approved > 0 && round2(line.quantity_issued) > round2(line.quantity_approved)) {
    return {
      ok: false,
      reason: `Cannot issue ${line.quantity_issued} — only ${line.quantity_approved} was approved.`,
    }
  }
  if (line.available !== undefined && round2(line.quantity_issued) > round2(line.available)) {
    return {
      ok: false,
      reason: `Cannot issue ${line.quantity_issued} — only ${line.available} in stock.`,
    }
  }
  return { ok: true }
}

// ─── Once-only posting ──────────────────────────────────────────────────────

/**
 * Guard for posting a document to the stock ledger. Backed by partial unique
 * indexes on inventory_movements, so a race that slips past this check still
 * cannot create a second movement.
 */
export function canPostToStock(doc: { status: string; posted_at: string | null }): { ok: boolean; reason?: string } {
  if (doc.status === 'cancelled') return { ok: false, reason: 'This document was cancelled.' }
  if (doc.status === 'posted' || doc.posted_at) {
    return { ok: false, reason: 'This document has already been posted to stock.' }
  }
  return { ok: true }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

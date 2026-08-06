// Iceland (Glitz N' Glim) manufacturing rules (§§19–32). Pure — unit-tested.
//
// SCOPE: "Iceland" is Iceland Geyser Ltd, which owns the Glitz N' Glim brand.
// It is not a seventh brand; everything here runs under brand_id = glitz-n-glim.
//
// Every rule in this file exists to keep the stock ledger honest. The stated
// invariant (§20) is:
//
//   closing = opening + inward - outward ± approved adjustments
//
// and it must hold at every point, for every item class, with each movement
// traceable to a finalised source document.

export const ITEM_TYPES = [
  'raw_material', 'packaging', 'work_in_progress', 'finished_good',
  'damaged', 'returned', 'sample', 'consumable',
] as const
export type ItemType = (typeof ITEM_TYPES)[number]

export const STORE_TYPES = [
  'raw', 'packaging', 'production', 'finished_goods', 'quarantine', 'field_sales', 'general',
] as const
export type StoreType = (typeof STORE_TYPES)[number]

export const PRODUCTION_STATUSES = [
  'planned', 'materials_requested', 'materials_issued', 'in_production',
  'awaiting_quality', 'completed', 'partially_completed', 'rejected', 'closed', 'cancelled',
] as const
export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number]

/** Item classes that count toward sellable/usable stock. Damaged and returned
 *  stock is tracked but is NOT available (§19). */
const AVAILABLE_TYPES = new Set<string>(['raw_material', 'packaging', 'finished_good', 'consumable'])

export function countsAsAvailable(itemType: string): boolean {
  return AVAILABLE_TYPES.has(itemType)
}

// ─── Goods receipt (§22) ────────────────────────────────────────────────────

export interface ReceiptLine {
  ordered_quantity: number
  delivered_quantity: number
  accepted_quantity: number
  rejected_quantity: number
}

/**
 * §22: "Rejected quantities must not enter available stock."
 * The quantity a goods receipt posts to stock is the ACCEPTED quantity only —
 * never delivered, never ordered.
 */
export function receiptStockQuantity(line: ReceiptLine): number {
  return Math.max(0, line.accepted_quantity)
}

export function validateReceiptLine(line: ReceiptLine): string[] {
  const problems: string[] = []
  if (line.delivered_quantity < 0 || line.accepted_quantity < 0 || line.rejected_quantity < 0) {
    problems.push('Quantities cannot be negative.')
  }
  if (line.accepted_quantity + line.rejected_quantity > line.delivered_quantity) {
    problems.push('Accepted plus rejected cannot exceed the delivered quantity.')
  }
  // Over-delivery is allowed but must be deliberate, so it is surfaced.
  if (line.delivered_quantity > line.ordered_quantity && line.ordered_quantity > 0) {
    problems.push(`Over-delivery: ${line.delivered_quantity} received against ${line.ordered_quantity} ordered.`)
  }
  return problems
}

/** §22: partial deliveries stay traceable. */
export function isPartialDelivery(line: ReceiptLine): boolean {
  return line.ordered_quantity > 0 && line.delivered_quantity < line.ordered_quantity
}

// ─── Material issue to production (§23) ─────────────────────────────────────

export interface RequisitionLine {
  requested_quantity: number
  approved_quantity: number
  issued_quantity: number
  available_quantity: number
}

/**
 * §23: "Approval alone must not reduce stock. Stock reduces only when the issue
 * is finalized." This function is the single answer to "how much does this
 * movement take out of the store", and approval is not one of its callers.
 */
export function issueStockQuantity(line: { issued_quantity: number }): number {
  return Math.max(0, line.issued_quantity)
}

export function validateIssueLine(line: RequisitionLine): string[] {
  const problems: string[] = []
  if (line.issued_quantity < 0) problems.push('Issued quantity cannot be negative.')
  if (line.approved_quantity > line.requested_quantity) {
    problems.push('Approved quantity cannot exceed the requested quantity.')
  }
  if (line.issued_quantity > line.approved_quantity) {
    problems.push(`Cannot issue ${line.issued_quantity} — only ${line.approved_quantity} was approved.`)
  }
  if (line.issued_quantity > line.available_quantity) {
    problems.push(`Cannot issue ${line.issued_quantity} — only ${line.available_quantity} is in stock.`)
  }
  return problems
}

// ─── Production reconciliation (§§23–25) ────────────────────────────────────

export interface RunMaterial {
  item_type: string
  expected_quantity: number
  issued_quantity: number
  returned_quantity: number
  consumed_quantity: number
  waste_quantity: number
}

export interface MaterialReconciliation {
  issued: number
  returned: number
  consumed: number
  waste: number
  /** Unaccounted-for material: issued - returned - consumed - waste. */
  unaccounted: number
  /** Consumed vs the BOM expectation. Positive = used more than planned. */
  varianceVsExpected: number
}

/**
 * §23/§25: reconcile expected against actual use. `unaccounted` is the number
 * that matters — material that left the store and cannot be explained by
 * consumption, return or recorded waste.
 */
export function reconcileMaterial(m: RunMaterial): MaterialReconciliation {
  const unaccounted = m.issued_quantity - m.returned_quantity - m.consumed_quantity - m.waste_quantity
  return {
    issued: m.issued_quantity,
    returned: m.returned_quantity,
    consumed: m.consumed_quantity,
    waste: m.waste_quantity,
    unaccounted: round3(unaccounted),
    varianceVsExpected: round3(m.consumed_quantity - m.expected_quantity),
  }
}

/** §25: packaging is reconciled separately from raw ingredients. */
export function splitByMaterialClass(materials: RunMaterial[]): {
  raw: RunMaterial[]
  packaging: RunMaterial[]
  other: RunMaterial[]
} {
  return {
    raw: materials.filter((m) => m.item_type === 'raw_material'),
    packaging: materials.filter((m) => m.item_type === 'packaging'),
    other: materials.filter((m) => m.item_type !== 'raw_material' && m.item_type !== 'packaging'),
  }
}

/** Expected component usage from a bill of materials, including wastage. */
export function expectedFromBom(
  bom: Array<{ quantity_per_unit: number; wastage_percent: number }>,
  plannedQuantity: number,
): number[] {
  return bom.map((line) =>
    round3(line.quantity_per_unit * plannedQuantity * (1 + (line.wastage_percent ?? 0) / 100)),
  )
}

// ─── Finished goods transfer (§26) ──────────────────────────────────────────

export interface FgTransfer {
  produced_quantity: number
  accepted_quantity: number
  rejected_quantity: number
  transferred_quantity: number
}

/**
 * §26: "Update available stock only for accepted finished goods."
 * A transfer adds its TRANSFERRED quantity, which can never exceed accepted.
 */
export function fgTransferStockQuantity(t: FgTransfer): number {
  return Math.max(0, Math.min(t.transferred_quantity, t.accepted_quantity))
}

export function validateFgTransfer(t: FgTransfer): string[] {
  const problems: string[] = []
  if (t.produced_quantity < 0 || t.accepted_quantity < 0 || t.rejected_quantity < 0 || t.transferred_quantity < 0) {
    problems.push('Quantities cannot be negative.')
  }
  if (t.accepted_quantity + t.rejected_quantity > t.produced_quantity) {
    problems.push('Accepted plus rejected cannot exceed the produced quantity.')
  }
  if (t.transferred_quantity > t.accepted_quantity) {
    problems.push('Cannot transfer more than the accepted quantity — rejected units never enter available stock.')
  }
  return problems
}

// ─── Ledger integrity (§20, §30) ────────────────────────────────────────────

export interface LedgerMovement {
  direction: 'in' | 'out'
  quantity: number
  quantity_after?: number | null
  movement_date?: string
}

/** §20: closing = opening + in - out ± adjustments. */
export function closingBalance(opening: number, movements: LedgerMovement[]): number {
  return round3(movements.reduce(
    (bal, m) => m.direction === 'in' ? bal + m.quantity : bal - m.quantity,
    opening,
  ))
}

export interface LedgerCheck {
  opening: number
  totalIn: number
  totalOut: number
  closing: number
  /** True when every recorded quantity_after matches the recomputed running balance. */
  consistent: boolean
  firstDivergenceIndex: number | null
}

/**
 * Recompute the running balance from the movement sequence and compare it to
 * each stored quantity_after. The stored value is a convenience; this is the
 * cross-check that proves the ledger has not been corrupted by an out-of-band
 * write. §37 requires "stock card balances match ledger".
 */
export function verifyLedger(opening: number, movements: LedgerMovement[]): LedgerCheck {
  let balance = opening
  let firstDivergenceIndex: number | null = null
  let totalIn = 0
  let totalOut = 0

  movements.forEach((m, i) => {
    if (m.direction === 'in') { balance += m.quantity; totalIn += m.quantity }
    else { balance -= m.quantity; totalOut += m.quantity }
    balance = round3(balance)
    if (m.quantity_after != null && firstDivergenceIndex === null
        && Math.abs(round3(m.quantity_after) - balance) > 0.0005) {
      firstDivergenceIndex = i
    }
  })

  return {
    opening,
    totalIn: round3(totalIn),
    totalOut: round3(totalOut),
    closing: balance,
    consistent: firstDivergenceIndex === null,
    firstDivergenceIndex,
  }
}

/**
 * §32: a reversal is an equal and opposite movement, never a deletion.
 * Returns the movement that undoes `m` — reversing a reversal restores the
 * original, and the ledger sum is unchanged, so no balance is silently lost.
 */
export function reversalOf(m: LedgerMovement): LedgerMovement {
  return { direction: m.direction === 'in' ? 'out' : 'in', quantity: m.quantity }
}

// ─── Production planning guide (§28) ────────────────────────────────────────

export interface SkuPlanningInput {
  item_id: string
  name: string
  available_quantity: number
  reserved_quantity: number
  unfulfilled_order_quantity: number
  production_threshold: number
  recent_daily_sales: number
  lead_time_days: number
  open_production_quantity: number
  blocking_raw?: string[]
  blocking_packaging?: string[]
}

export interface ProductionSuggestion {
  item_id: string
  name: string
  usableStock: number
  daysOfStock: number | null
  shortfall: number
  suggestedQuantity: number
  /** Always a SUGGESTION (§28) — never an approved production order. */
  isSuggestion: true
  blocked: boolean
  blockingRaw: string[]
  blockingPackaging: string[]
  action: 'none' | 'monitor' | 'plan_production' | 'urgent'
}

/**
 * §28's chasing guide. Explicitly labelled as a suggestion: "Clearly label
 * calculated recommendations as system suggestions rather than confirmed
 * production orders. Managers should approve a production plan before it
 * becomes an active production run."
 *
 * Usable stock excludes reserved units, because stock promised to a confirmed
 * order cannot also satisfy the next one.
 */
export function suggestProduction(input: SkuPlanningInput): ProductionSuggestion {
  const usableStock = round3(input.available_quantity - input.reserved_quantity)
  const daysOfStock = input.recent_daily_sales > 0
    ? round3(usableStock / input.recent_daily_sales)
    : null

  // Demand to cover: unfulfilled orders, plus enough to get back above the
  // threshold, less whatever is already in production.
  const belowThreshold = Math.max(0, input.production_threshold - usableStock)
  const shortfall = round3(Math.max(0, input.unfulfilled_order_quantity + belowThreshold - input.open_production_quantity))

  const blockingRaw = input.blocking_raw ?? []
  const blockingPackaging = input.blocking_packaging ?? []
  const blocked = blockingRaw.length > 0 || blockingPackaging.length > 0

  let action: ProductionSuggestion['action'] = 'none'
  if (shortfall > 0) {
    const coverDays = daysOfStock
    action = (usableStock <= 0 || (coverDays !== null && coverDays <= input.lead_time_days))
      ? 'urgent'
      : 'plan_production'
  } else if (daysOfStock !== null && daysOfStock <= input.lead_time_days * 2) {
    action = 'monitor'
  }

  return {
    item_id: input.item_id,
    name: input.name,
    usableStock,
    daysOfStock,
    shortfall,
    suggestedQuantity: shortfall,
    isSuggestion: true,
    blocked,
    blockingRaw,
    blockingPackaging,
    action,
  }
}

// ─── Stock counts (§31) ─────────────────────────────────────────────────────

export interface CountLine {
  expected_quantity: number
  counted_quantity: number | null
  reason: string
}

export function countVariance(line: CountLine): number {
  if (line.counted_quantity == null) return 0
  return round3(line.counted_quantity - line.expected_quantity)
}

/**
 * §31: "Do not let a stock-count user directly change the ledger balance
 * without approval." A line may only be posted as an adjustment when it has
 * been counted AND any variance carries an explanation.
 */
export function canPostCountLine(line: CountLine): boolean {
  if (line.counted_quantity == null) return false
  if (countVariance(line) === 0) return true
  return line.reason.trim().length > 0
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

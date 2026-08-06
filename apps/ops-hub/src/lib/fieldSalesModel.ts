// Field-sales stock custody (addendum §§15–22, §29). Pure — unit-tested.
//
// The invariant this file protects (addendum §19):
//
//   1. Main store        -> sales custody   (weekly delivery note)
//   2. Sales custody     -> sold            (daily invoice)
//   3. Unsold custody    -> back to store   (return note)
//
//   "Do not deduct sold stock twice from the main store."
//
// A weekly allocation is a CUSTODY TRANSFER, not a sale: it moves stock between
// two locations Iceland owns. Total company-owned stock is unchanged and no
// revenue exists yet. The daily invoice then reduces custody only.

export const CUSTODY_MOVEMENT_KINDS = [
  'issue', 'sale', 'return', 'damage', 'sample', 'promotion', 'adjustment', 'reversal',
] as const
export type CustodyMovementKind = (typeof CUSTODY_MOVEMENT_KINDS)[number]

export const ALLOCATION_STATUSES = [
  'draft', 'prepared', 'issued', 'active', 'partially_reconciled',
  'awaiting_returns', 'reconciled', 'closed', 'variance_under_review', 'cancelled',
] as const

export interface CustodyMovement {
  movement_kind: CustodyMovementKind
  direction: 'in' | 'out'
  quantity: number
}

/** Which custody movements ADD to a salesperson's holding. */
export function custodyDirectionFor(kind: CustodyMovementKind): 'in' | 'out' {
  // Only an issue (and a corrective adjustment) increases custody. Everything
  // else — sale, return to store, damage, sample, promotion — reduces it.
  return kind === 'issue' ? 'in' : 'out'
}

/**
 * §17's custody formula:
 *   closing = opening + issues − invoiced sales − accepted returns
 *             − approved damage/promotional issues ± approved adjustments
 */
export function custodyBalance(opening: number, movements: CustodyMovement[]): number {
  return round3(movements.reduce(
    (bal, m) => m.direction === 'in' ? bal + m.quantity : bal - m.quantity,
    opening,
  ))
}

// ─── Stock-effect rules — the double-deduction guard ────────────────────────

export interface StockEffect {
  /** Change to the finished-goods MAIN STORE. */
  mainStore: number
  /** Change to the salesperson's CUSTODY balance. */
  custody: number
  /** Change to total company-owned stock. Must be 0 for pure transfers. */
  companyOwned: number
  createsRevenue: boolean
}

/**
 * §16: finalising a weekly allocation "should reduce available stock in the
 * finished-goods store, increase stock held in sales-team custody, preserve the
 * total stock owned by Iceland, not create revenue, not create an invoice."
 */
export function allocationStockEffect(quantityIssued: number): StockEffect {
  return {
    mainStore: -quantityIssued,
    custody: +quantityIssued,
    companyOwned: 0,        // a transfer between two owned locations
    createsRevenue: false,
  }
}

/**
 * §19: a daily invoice reduces CUSTODY only. The main store was already reduced
 * by the delivery note — touching it again here is the exact double-deduction
 * the addendum forbids.
 */
export function invoiceStockEffect(quantitySold: number): StockEffect {
  return {
    mainStore: 0,           // NOT touched again
    custody: -quantitySold,
    companyOwned: -quantitySold,  // the goods have genuinely left the company
    createsRevenue: true,
  }
}

/** §22: accepted returns re-enter the main store; rejected/damaged do not. */
export function returnStockEffect(accepted: number, rejected: number): StockEffect {
  return {
    mainStore: neg0(accepted),
    custody: neg0(-(accepted + rejected)),
    // Rejected stock leaves the available pool; it is written off, not restocked.
    companyOwned: neg0(-rejected),
    createsRevenue: false,
  }
}

/** Damage recorded in the field: leaves custody, never re-enters the store. */
export function damageStockEffect(quantity: number): StockEffect {
  return {
    mainStore: 0,
    custody: neg0(-quantity),
    companyOwned: neg0(-quantity),
    createsRevenue: false,
  }
}

/** Normalise -0 to 0. A stock effect of "negative zero" is meaningless, and it
 *  compares unequal to 0 under Object.is, which callers and tests would trip on. */
function neg0(n: number): number { return n === 0 ? 0 : n }

// ─── Validation (§20) ───────────────────────────────────────────────────────

export interface AllocationLine {
  item_id: string
  item_name: string
  quantity_issued: number
}

export interface CustodyPosition {
  item_id: string
  issued: number
  sold: number
  returned: number
  damaged: number
  promotional: number
}

export function positionBalance(p: CustodyPosition): number {
  return round3(p.issued - p.sold - p.returned - p.damaged - p.promotional)
}

export interface CustodyFlag {
  item_id: string
  kind:
    | 'invoiced_exceeds_allocated'
    | 'returned_exceeds_remaining'
    | 'negative_custody'
    | 'sku_not_allocated'
    | 'payment_mismatch'
  detail: string
}

/**
 * §20's flag list. Each condition is checked independently so a reconciliation
 * report shows every problem, not just the first.
 */
export function flagCustodyIssues(
  positions: CustodyPosition[],
  opts: { invoicedItemIds?: string[] } = {},
): CustodyFlag[] {
  const flags: CustodyFlag[] = []
  const allocated = new Set(positions.filter((p) => p.issued > 0).map((p) => p.item_id))

  for (const p of positions) {
    const balance = positionBalance(p)
    if (p.sold > p.issued) {
      flags.push({
        item_id: p.item_id, kind: 'invoiced_exceeds_allocated',
        detail: `Invoiced ${p.sold} against ${p.issued} allocated.`,
      })
    }
    if (p.returned > round3(p.issued - p.sold)) {
      flags.push({
        item_id: p.item_id, kind: 'returned_exceeds_remaining',
        detail: `Returned ${p.returned} but only ${round3(p.issued - p.sold)} remained.`,
      })
    }
    if (balance < 0) {
      flags.push({
        item_id: p.item_id, kind: 'negative_custody',
        detail: `Custody balance is ${balance}.`,
      })
    }
  }

  for (const id of opts.invoicedItemIds ?? []) {
    if (!allocated.has(id)) {
      flags.push({
        item_id: id, kind: 'sku_not_allocated',
        detail: 'Invoiced a SKU that was not on the allocation.',
      })
    }
  }
  return flags
}

/** §20/§28: submitted cash must match invoiced sales less credit. */
export function paymentMismatch(input: {
  invoicedTotal: number
  cash: number
  mobileMoney: number
  bank: number
  credit: number
}): { expected: number; submitted: number; difference: number; matches: boolean } {
  const expected = round2(input.invoicedTotal - input.credit)
  const submitted = round2(input.cash + input.mobileMoney + input.bank)
  const difference = round2(submitted - expected)
  return { expected, submitted, difference, matches: Math.abs(difference) < 0.005 }
}

// ─── Weekly closure (§21) ───────────────────────────────────────────────────

export interface WeeklyReconciliation {
  positions: Array<CustodyPosition & { balance: number }>
  totalIssued: number
  totalSold: number
  totalReturned: number
  totalDamaged: number
  unexplainedVariance: number
  flags: CustodyFlag[]
  canClose: boolean
}

/**
 * §21: "Do not allow a weekly allocation to close with unexplained variance
 * unless an authorized manager approves it with a reason."
 *
 * `canClose` is false whenever variance or a flag exists, UNLESS a manager
 * approval with a non-empty reason is supplied.
 */
export function reconcileWeek(
  positions: CustodyPosition[],
  opts: { managerApproval?: { approvedBy: string; reason: string } | null } = {},
): WeeklyReconciliation {
  const withBalance = positions.map((p) => ({ ...p, balance: positionBalance(p) }))
  const flags = flagCustodyIssues(positions)

  // Anything still sitting in custody at week end that was not returned is
  // unexplained — the team either has it or cannot account for it.
  const unexplainedVariance = round3(withBalance.reduce((sum, p) => sum + p.balance, 0))

  const approval = opts.managerApproval
  const approved = !!approval && approval.reason.trim().length > 0 && approval.approvedBy.trim().length > 0
  const clean = unexplainedVariance === 0 && flags.length === 0

  return {
    positions: withBalance,
    totalIssued: round3(positions.reduce((s, p) => s + p.issued, 0)),
    totalSold: round3(positions.reduce((s, p) => s + p.sold, 0)),
    totalReturned: round3(positions.reduce((s, p) => s + p.returned, 0)),
    totalDamaged: round3(positions.reduce((s, p) => s + p.damaged, 0)),
    unexplainedVariance,
    flags,
    canClose: clean || approved,
  }
}

/** §24: a spreadsheet import must not re-post a delivery note or invoice that
 *  already exists. Returns the references that would duplicate. */
export function detectDuplicateReferences(
  incoming: Array<{ reference: string }>,
  existing: string[],
): string[] {
  const have = new Set(existing.map((r) => r.trim().toLowerCase()).filter(Boolean))
  const seen = new Set<string>()
  const dupes: string[] = []
  for (const row of incoming) {
    const ref = row.reference.trim().toLowerCase()
    if (!ref) continue
    if (have.has(ref) || seen.has(ref)) dupes.push(row.reference)
    seen.add(ref)
  }
  return dupes
}

function round3(n: number): number { return Math.round(n * 1000) / 1000 }
function round2(n: number): number { return Math.round(n * 100) / 100 }

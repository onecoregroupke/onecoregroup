export const STOCK_TAKE_REASON_CODES = [
  { value: 'count_correction', label: 'Count correction' },
  { value: 'damaged_stock', label: 'Damaged stock' },
  { value: 'expired_stock', label: 'Expired stock' },
  { value: 'production_usage_not_recorded', label: 'Production usage not recorded' },
  { value: 'receipt_not_recorded', label: 'Receipt not recorded' },
  { value: 'issue_not_recorded', label: 'Issue not recorded' },
  { value: 'packaging_variance', label: 'Packaging variance' },
  { value: 'spillage_wastage', label: 'Spillage / wastage' },
  { value: 'theft_shrinkage', label: 'Theft / shrinkage' },
  { value: 'data_entry_error', label: 'Data entry error' },
  { value: 'unit_conversion_issue', label: 'Unit conversion issue' },
  { value: 'other', label: 'Other' },
] as const

export type StockTakeReasonCode = (typeof STOCK_TAKE_REASON_CODES)[number]['value']

export interface CountLineForReview {
  id: string
  item_id: string
  expected_quantity: number
  counted_quantity: number | null
  reason_code?: string
  reason?: string
  movement_id?: string | null
  status?: string
}

export interface CountHeaderForPosting {
  status: string
  frozen_at: string | null
  posted_at?: string | null
}

export interface LedgerMovementAfterFreeze {
  item_id: string
  created_at?: string
  effective_at?: string
  source?: string
  stock_count_id?: string | null
}

export interface StockTakeAdjustment {
  item_id: string
  direction: 'in' | 'out'
  quantity: number
}

export function stockTakeVariance(expected: number, counted: number | null): number {
  if (counted === null || counted === undefined) return 0
  return round3(Number(counted) - Number(expected))
}

export function stockTakeVariancePercent(expected: number, counted: number | null): number | null {
  if (!expected || counted === null || counted === undefined) return null
  return Number(((stockTakeVariance(expected, counted) / Math.abs(expected)) * 100).toFixed(2))
}

export function buildStockTakeAdjustment(line: CountLineForReview): StockTakeAdjustment | null {
  if (line.movement_id) return null
  const variance = stockTakeVariance(line.expected_quantity, line.counted_quantity)
  if (variance === 0) return null
  return {
    item_id: line.item_id,
    direction: variance > 0 ? 'in' : 'out',
    quantity: Math.abs(variance),
  }
}

export function validateStockTakeForPosting(
  count: CountHeaderForPosting,
  lines: CountLineForReview[],
  movementsAfterFreeze: LedgerMovementAfterFreeze[] = [],
): string[] {
  const errors: string[] = []
  if (count.posted_at || count.status === 'posted') errors.push('This stock take has already been posted.')
  if (count.status !== 'approved') errors.push('Stock take must be approved before posting.')
  if (!count.frozen_at) errors.push('Stock take has no frozen balance timestamp.')

  for (const line of lines) {
    if (line.counted_quantity === null || line.counted_quantity === undefined) {
      errors.push('Every stock-take line must be counted, including zero physical quantity.')
      break
    }
  }

  for (const line of lines) {
    const variance = stockTakeVariance(line.expected_quantity, line.counted_quantity)
    if (variance !== 0 && !(line.reason_code || line.reason || '').trim()) {
      errors.push('Every non-zero variance needs a reason before posting.')
      break
    }
  }

  if (movementsAfterFreeze.some((m) => !m.stock_count_id)) {
    errors.push('Inventory changed after this stock take was frozen. Re-freeze or start a new stock take before posting.')
  }

  return [...new Set(errors)]
}

export function applyStockTakeAdjustments(startingBalance: number, lines: CountLineForReview[]): Map<string, number> {
  const balances = new Map<string, number>()
  for (const line of lines) {
    const current = balances.get(line.item_id) ?? startingBalance
    const adjustment = buildStockTakeAdjustment(line)
    if (!adjustment) {
      balances.set(line.item_id, current)
      continue
    }
    balances.set(line.item_id, adjustment.direction === 'in'
      ? round3(current + adjustment.quantity)
      : round3(current - adjustment.quantity))
  }
  return balances
}

function round3(n: number): number {
  return Number(n.toFixed(3))
}

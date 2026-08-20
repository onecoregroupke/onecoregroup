export function toBaseQuantity(quantity: number, conversionRate: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Quantity must be greater than 0')
  if (!Number.isFinite(conversionRate) || conversionRate <= 0) throw new Error('Unit conversion must be greater than 0')
  return quantity * conversionRate
}

export interface StockCountObservation {
  physicalQuantity: number
  systemQuantity: number
  variance: number
  createsMovement: false
}

/** A count is evidence only. A separate approved adjustment workflow may later
 * consume its variance, but this function can never emit a movement. */
export function observeStockCount(physicalQuantity: number, systemQuantity: number): StockCountObservation {
  return { physicalQuantity, systemQuantity, variance: physicalQuantity - systemQuantity, createsMovement: false }
}


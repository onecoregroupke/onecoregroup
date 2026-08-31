const UNIT_ALIASES: Record<string, string> = {
  l: 'ltrs',
  lt: 'ltrs',
  ltr: 'ltrs',
  ltrs: 'ltrs',
  liter: 'ltrs',
  liters: 'ltrs',
  litre: 'ltrs',
  litres: 'ltrs',
  ml: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  kg: 'kg',
  kgs: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
}

/** Canonicalize labels without guessing between physically incompatible units. */
export function normalizeInventoryUnit(value: string | null | undefined): string {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
  return UNIT_ALIASES[normalized] ?? normalized
}

/** Base units per entered unit. Unknown cross-unit conversions stay unresolved. */
export function inventoryUnitConversionRate(fromUnit: string, toBaseUnit: string): number | null {
  const from = normalizeInventoryUnit(fromUnit)
  const to = normalizeInventoryUnit(toBaseUnit)
  if (from && from === to) return 1
  if (from === 'ltrs' && to === 'ml') return 1000
  if (from === 'ml' && to === 'ltrs') return 0.001
  return null
}

export function toInventoryBaseQuantity(quantity: number, fromUnit: string, toBaseUnit: string): number {
  const rate = inventoryUnitConversionRate(fromUnit, toBaseUnit)
  if (rate == null) {
    throw new Error(`Cannot convert ${fromUnit || 'unspecified units'} to ${toBaseUnit || 'the inventory base unit'}.`)
  }
  return quantity * rate
}

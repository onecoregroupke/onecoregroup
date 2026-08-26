export interface FinishedGoodsQuantityView {
  totalPieces: number
  cartons: number
  loosePieces: number
  hasCartonView: boolean
  totalLabel: string
  cartonLabel: string | null
}

function finiteNumber(value: number): number {
  return Number.isFinite(Number(value)) ? Number(value) : 0
}

export function formatInventoryNumber(value: number): string {
  return finiteNumber(value).toLocaleString(undefined, { maximumFractionDigits: 3 })
}

function quantityLabel(value: number, singular: string, plural: string): string {
  return `${formatInventoryNumber(value)} ${Math.abs(value) === 1 ? singular : plural}`
}

/**
 * Present a piece-based finished-goods balance in both canonical pieces and its
 * derived carton/loose-piece form. The ledger quantity is never changed.
 */
export function finishedGoodsQuantity(totalPieces: number, packSize: number): FinishedGoodsQuantityView {
  const total = finiteNumber(totalPieces)
  const pack = finiteNumber(packSize)
  const hasCartonView = total >= 0 && Number.isInteger(pack) && pack > 1
  const cartons = hasCartonView ? Math.floor(total / pack) : 0
  const loosePieces = hasCartonView ? Number((total - cartons * pack).toFixed(3)) : total

  let cartonLabel: string | null = null
  if (hasCartonView) {
    if (cartons === 0) cartonLabel = `${quantityLabel(loosePieces, 'loose piece', 'loose pieces')}`
    else if (loosePieces === 0) cartonLabel = quantityLabel(cartons, 'carton', 'cartons')
    else cartonLabel = `${quantityLabel(cartons, 'carton', 'cartons')} + ${quantityLabel(loosePieces, 'piece', 'pieces')}`
  }

  return {
    totalPieces: total,
    cartons,
    loosePieces,
    hasCartonView,
    totalLabel: `${quantityLabel(total, 'piece', 'pieces')} total`,
    cartonLabel,
  }
}

/** Used by migrations/diagnostics, never as a UI substitute for item.pack_size. */
export function packSizeFromConfiguration(packageConfig: string | null | undefined): number | null {
  const match = String(packageConfig ?? '').trim().match(/^(\d+)\s*[x×]/i)
  if (!match) return null
  const packSize = Number(match[1])
  return Number.isInteger(packSize) && packSize > 0 ? packSize : null
}

export function formatPackageConfiguration(packageConfig: string | null | undefined): string {
  const raw = String(packageConfig ?? '').trim()
  if (!raw) return ''
  const match = raw.match(/^(\d+)\s*[x×]\s*(.+)$/i)
  if (!match) return raw
  const size = match[2]!
    .replace(/(\d+(?:\.\d+)?)\s*l(?:tr|trs|rs)?\b/i, '$1L')
    .replace(/(\d+(?:\.\d+)?)\s*ml\b/i, '$1ml')
  return `${match[1]} × ${size}`
}

export function finishedGoodsOptionLabel(totalPieces: number, packSize: number): string {
  const view = finishedGoodsQuantity(totalPieces, packSize)
  return view.cartonLabel ? `${view.totalLabel} · ${view.cartonLabel}` : view.totalLabel
}

export function inventoryOptionStockLabel(item: {
  onHand?: number
  unit: string
  itemType?: string
  packSize?: number
}): string {
  if (item.onHand == null) return ''
  return item.itemType === 'finished_good'
    ? finishedGoodsOptionLabel(item.onHand, Number(item.packSize ?? 1))
    : `${formatInventoryNumber(item.onHand)} ${item.unit}`
}

import { finishedGoodsQuantity } from '@/lib/finishedGoodsQuantity'

export function FinishedGoodsQuantity({
  totalPieces,
  packSize,
  className = '',
  compact = false,
}: {
  totalPieces: number
  packSize: number
  className?: string
  compact?: boolean
}) {
  const view = finishedGoodsQuantity(totalPieces, packSize)
  return (
    <span className={className}>
      <span className="block tabular-nums">{compact ? view.totalLabel.replace('pieces total', 'pcs').replace('piece total', 'pc') : view.totalLabel}</span>
      {view.cartonLabel && (
        <span className="block text-[11px] font-normal tabular-nums text-gray-400">{view.cartonLabel}</span>
      )}
    </span>
  )
}

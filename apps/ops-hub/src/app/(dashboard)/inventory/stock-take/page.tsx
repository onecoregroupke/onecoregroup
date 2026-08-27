import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireSection } from '@/lib/server-auth'
import { getStockTakeDetail, listStockCounts, listStores } from '@/lib/inventoryStockTake'
import { StockTakeWorkspace } from '@/components/inventory/StockTakeWorkspace'

export const dynamic = 'force-dynamic'

export default async function StockTakePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const actor = await requireSection('inventory')
  const canEdit = actor.can('inventory', 'edit')
  const allowed = actor.allowedBrandIds('inventory')
  const params = await searchParams
  const [stores, counts] = await Promise.all([
    listStores(allowed),
    listStockCounts(allowed, { limit: 60 }),
  ])
  let detail = null
  if (params.id) {
    try {
      detail = await getStockTakeDetail(allowed, params.id)
    } catch {
      detail = null
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/inventory" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft size={15} /> Inventory
      </Link>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Inventory control</p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">Stock Take</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-500">
          Monthly physical count reconciliation. The frozen system quantity is compared to the physical quantity; approved differences post as explicit stock-take adjustment movements.
        </p>
      </div>
      <StockTakeWorkspace key={detail?.count.id ?? 'new'} stores={stores} counts={counts} detail={detail} canEdit={canEdit} />
    </div>
  )
}

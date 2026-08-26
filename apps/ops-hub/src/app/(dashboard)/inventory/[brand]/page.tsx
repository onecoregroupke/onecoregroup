import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, TriangleAlert } from 'lucide-react'
import { resolveBrand } from '@/lib/brands'
import { inventoryCategories } from '@/lib/brandCategories'
import { listItems, listMovements } from '@/lib/inventory'
import { requireSection } from '@/lib/server-auth'
import { InventoryForms } from '@/components/inventory/InventoryForms'
import { FinishedGoodsQuantity } from '@/components/inventory/FinishedGoodsQuantity'
import { inventoryBreadcrumb, inventoryTaxonomy } from '@/lib/inventoryTaxonomy'
import { finishedGoodsQuantity } from '@/lib/finishedGoodsQuantity'

export const dynamic = 'force-dynamic'

export default async function BrandInventoryPage({
  params,
}: {
  params: Promise<{ brand: string }>
}) {
  const actor = await requireSection('inventory')
  const { brand: slug } = await params
  const brand = await resolveBrand(slug)
  if (!brand) notFound()

  // Brand compartment: a scoped storekeeper cannot open another brand's page.
  const allowed = actor.allowedBrandIds('inventory')
  if (allowed !== null && !allowed.includes(brand.id)) redirect('/inventory')

  const [items, movements] = await Promise.all([
    listItems(allowed, brand.id),
    listMovements(allowed, { brandId: brand.id, limit: 40 }),
  ])
  const itemById = new Map(items.map((i) => [i.id, i]))
  const totalValue = items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_value_ksh), 0)
  const canEdit = actor.can('inventory', 'edit')
  const categories = inventoryCategories(brand.slug)

  // The same normalized taxonomy used by Manufacturing and Stock Cards.
  const taxonomyCategories = [...new Set(items.map((item) => inventoryTaxonomy(item).category))]
  const byCategory = taxonomyCategories
    .map((category) => {
      const catItems = items.filter((item) => inventoryTaxonomy(item).category === category)
      return {
        category,
        count: catItems.length,
        value: catItems.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_value_ksh), 0),
      }
    })
  const uncategorised = items.filter((item) => inventoryTaxonomy(item).category === 'Other / Unclassified').length

  return (
    <div className="space-y-6">
      <Link href="/inventory" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft size={15} /> All brands
      </Link>

      <div className="flex items-center gap-3">
        <span className="h-4 w-4 rounded-full" style={{ backgroundColor: brand.color_hex }} />
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{brand.name} inventory</h1>
          <p className="text-sm text-gray-500">{items.length} items · total value KSh {totalValue.toLocaleString()}</p>
        </div>
      </div>

      {canEdit && (
        <InventoryForms
          brandId={brand.id}
          items={items.map((i) => ({
            id: i.id, label: `${i.name}${i.sku ? ` (${i.sku})` : ''}`, unit: i.unit,
            quantity: Number(i.quantity), itemType: i.item_type, packSize: Number(i.pack_size ?? 1),
          }))}
          categories={categories}
        />
      )}

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Classification</h2>
        <div className="flex flex-wrap gap-2">
          {byCategory.map(({ category, count, value }) => (
            <span key={category} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${count ? 'border-gray-200 text-gray-700' : 'border-dashed border-gray-200 text-gray-400'}`}>
              <span className="font-medium">{category}</span>
              <span className="text-xs text-gray-400">{count} item{count === 1 ? '' : 's'}{value > 0 ? ` · KSh ${value.toLocaleString()}` : ''}</span>
            </span>
          ))}
          {uncategorised > 0 && (
            <span className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-700">
              Uncategorised <span className="text-xs">{uncategorised} item{uncategorised === 1 ? '' : 's'}</span>
            </span>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Stock register</h2>
        {items.length === 0 ? (
          <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">No items yet. Add the first item above.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2 text-right">In stock</th>
                  <th className="px-3 py-2 text-right">Unit value</th>
                  <th className="px-3 py-2 text-right">Total value</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((item) => {
                  const low = Number(item.reorder_level) > 0 && Number(item.quantity) <= Number(item.reorder_level)
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-gray-800">{item.name}</p>
                        {item.sku && <p className="text-xs text-gray-400">{item.sku}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">{inventoryBreadcrumb(item)}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-gray-800">
                        {item.item_type === 'finished_good' ? (
                          <FinishedGoodsQuantity totalPieces={Number(item.quantity)} packSize={Number(item.pack_size ?? 1)} />
                        ) : `${Number(item.quantity).toLocaleString()} ${item.base_unit || item.unit}`}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-600">KSh {Number(item.unit_value_ksh).toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right text-gray-800">KSh {(Number(item.quantity) * Number(item.unit_value_ksh)).toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-gray-500">{item.location || '—'}</td>
                      <td className="px-3 py-2.5 text-right">
                        {low && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                            <TriangleAlert size={11} /> Reorder
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Movement history</h2>
        {movements.length === 0 ? (
          <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">No movements recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2 text-right">In</th>
                  <th className="px-3 py-2 text-right">Out</th>
                  <th className="px-3 py-2 text-right">Stock after</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {movements.map((m) => {
                  const item = itemById.get(m.item_id)
                  return (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{m.movement_date}</td>
                      <td className="px-3 py-2.5 text-gray-800">{item?.name ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-emerald-700">{m.direction === 'in' ? quantityCell(item, Number(m.quantity)) : ''}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-red-700">{m.direction === 'out' ? quantityCell(item, Number(m.quantity)) : ''}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700">{m.quantity_after != null ? quantityCell(item, Number(m.quantity_after)) : '—'}</td>
                      <td className="px-3 py-2.5 max-w-[220px] truncate text-gray-500" title={m.reason}>{m.reason || m.source}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-500">{m.recorded_by || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function quantityCell(item: Awaited<ReturnType<typeof listItems>>[number] | undefined, quantity: number) {
  if (item?.item_type !== 'finished_good') return quantity.toLocaleString()
  const view = finishedGoodsQuantity(quantity, Number(item.pack_size ?? 1))
  return <span>{view.totalLabel}{view.cartonLabel && <span className="block text-[10px] font-normal text-gray-400">{view.cartonLabel}</span>}</span>
}

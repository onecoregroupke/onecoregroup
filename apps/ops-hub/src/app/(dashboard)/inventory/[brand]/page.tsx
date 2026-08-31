import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, TriangleAlert } from 'lucide-react'
import { resolveBrand } from '@/lib/brands'
import { inventoryCategories } from '@/lib/brandCategories'
import { listItems, listMovements } from '@/lib/inventory'
import { requireSection } from '@/lib/server-auth'
import { InventoryForms } from '@/components/inventory/InventoryForms'
import { FinishedGoodsQuantity } from '@/components/inventory/FinishedGoodsQuantity'
import {
  filterInventoryByTaxonomy,
  inventoryBreadcrumb,
  inventoryTaxonomy,
  parseInventoryClassifications,
  serializeInventoryClassifications,
  toggleInventoryClassification,
} from '@/lib/inventoryTaxonomy'
import { finishedGoodsQuantity } from '@/lib/finishedGoodsQuantity'

export const dynamic = 'force-dynamic'

export default async function BrandInventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ brand: string }>
  searchParams: Promise<{ classifications?: string | string[] }>
}) {
  const actor = await requireSection('inventory')
  const { brand: slug } = await params
  const brand = await resolveBrand(slug)
  if (!brand) notFound()

  // Brand compartment: a scoped storekeeper cannot open another brand's page.
  const allowed = actor.allowedBrandIds('inventory')
  if (allowed !== null && !allowed.includes(brand.id)) redirect('/inventory')

  const items = await listItems(allowed, brand.id)
  const referenceCostValue = items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_value_ksh), 0)
  const retailSalesValue = items
    .filter((i) => i.item_type === 'finished_good')
    .reduce((sum, i) => sum + Number(i.quantity) * Number(i.selling_price_ksh), 0)
  const wholesaleSalesValue = items
    .filter((i) => i.item_type === 'finished_good')
    .reduce((sum, i) => sum + Number(i.quantity) * Number(i.wholesale_price_ksh), 0)
  const canEdit = actor.can('inventory', 'edit')
  const categories = inventoryCategories(brand.slug)

  // The same normalized taxonomy used by Manufacturing and Stock Cards.
  const categoryGroups = new Map<string, { categoryKey: string; category: string; count: number; value: number }>()
  for (const item of items) {
    const taxonomy = inventoryTaxonomy(item)
    const existing = categoryGroups.get(taxonomy.categoryKey)
    if (existing) {
      existing.count += 1
      existing.value += Number(item.quantity) * Number(item.unit_value_ksh)
    } else {
      categoryGroups.set(taxonomy.categoryKey, {
        categoryKey: taxonomy.categoryKey,
        category: taxonomy.category,
        count: 1,
        value: Number(item.quantity) * Number(item.unit_value_ksh),
      })
    }
  }
  const byCategory = [...categoryGroups.values()]
  const requestedClassifications = parseInventoryClassifications((await searchParams).classifications)
  const availableClassifications = new Set(byCategory.map((category) => category.categoryKey))
  const selectedClassifications = requestedClassifications.filter((value) => availableClassifications.has(value))
  const visibleItems = filterInventoryByTaxonomy(items, { categories: selectedClassifications })
  const movements = await listMovements(allowed, {
    brandId: brand.id,
    itemIds: selectedClassifications.length > 0 ? visibleItems.map((item) => item.id) : undefined,
    limit: 40,
  })
  const itemById = new Map(items.map((i) => [i.id, i]))

  return (
    <div className="space-y-6">
      <Link href="/inventory" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft size={15} /> All brands
      </Link>

      <div className="flex items-center gap-3">
        <span className="h-4 w-4 rounded-full" style={{ backgroundColor: brand.color_hex }} />
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{brand.name} inventory</h1>
          <p className="text-sm text-gray-500">
            {items.length} items · reference cost value KSh {referenceCostValue.toLocaleString()}
            {retailSalesValue > 0 && ` · retail sales value KSh ${retailSalesValue.toLocaleString()}`}
            {wholesaleSalesValue > 0 && ` · wholesale sales value KSh ${wholesaleSalesValue.toLocaleString()}`}
          </p>
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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Classification</h2>
          {selectedClassifications.length > 0 && (
            <Link href={`/inventory/${brand.slug}`} className="inline-flex min-h-11 items-center px-1 text-xs font-medium text-gray-500 underline decoration-gray-300 underline-offset-4 hover:text-gray-800">
              Clear filters
            </Link>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {byCategory.map(({ categoryKey, category, count, value }) => {
            const active = selectedClassifications.includes(categoryKey)
            const next = toggleInventoryClassification(selectedClassifications, categoryKey)
            const serialized = serializeInventoryClassifications(next)
            const href = serialized
              ? `/inventory/${brand.slug}?classifications=${serialized}`
              : `/inventory/${brand.slug}`
            return (
              <Link
                key={categoryKey}
                href={href}
                prefetch={false}
                aria-label={`${category}, ${count} item${count === 1 ? '' : 's'}, ${active ? 'selected' : 'not selected'}`}
                className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocg-gold focus-visible:ring-offset-2 ${
                  active
                    ? 'border-ocg-navy bg-ocg-navy text-white shadow-sm'
                    : categoryKey === 'unclassified'
                      ? 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 hover:bg-amber-100'
                      : 'border-gray-200 text-gray-700 hover:border-ocg-gold/50 hover:bg-gray-50'
                }`}
              >
                <span>{category}</span>
                <span className={`text-xs font-normal ${active ? 'text-white/70' : categoryKey === 'unclassified' ? 'text-amber-600' : 'text-gray-400'}`}>
                  {count} item{count === 1 ? '' : 's'}{value > 0 ? ` · KSh ${value.toLocaleString()}` : ''}
                </span>
              </Link>
            )
          })}
        </div>
        <p className="mt-3 text-xs text-gray-500">Showing {visibleItems.length} of {items.length} items</p>
      </section>

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Stock register</h2>
        {visibleItems.length === 0 ? (
          <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">
            {items.length === 0 ? 'No items yet. Add the first item above.' : 'No inventory items match the selected classifications.'}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2 text-right">In stock</th>
                  <th className="px-3 py-2 text-right">Reference / prices</th>
                  <th className="px-3 py-2 text-right">Estimated value</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visibleItems.map((item) => {
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
                      <td className="px-3 py-2.5 text-right text-gray-600">{priceCell(item)}</td>
                      <td className="px-3 py-2.5 text-right text-gray-800">{valueCell(item)}</td>
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
          <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">
            {selectedClassifications.length > 0 ? 'No movements match the selected classifications.' : 'No movements recorded yet.'}
          </p>
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
                      <td className="px-3 py-2.5 text-right font-medium text-emerald-700">{m.direction === 'in' ? quantityCell(item, Number(m.base_quantity ?? m.quantity)) : ''}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-red-700">{m.direction === 'out' ? quantityCell(item, Number(m.base_quantity ?? m.quantity)) : ''}</td>
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

function priceCell(item: Awaited<ReturnType<typeof listItems>>[number]) {
  if (item.item_type !== 'finished_good') return <span>Ref cost KSh {Number(item.unit_value_ksh).toLocaleString()}</span>
  return (
    <span>
      Retail KSh {Number(item.selling_price_ksh).toLocaleString()}
      <span className="block text-[10px] text-gray-400">Wholesale KSh {Number(item.wholesale_price_ksh).toLocaleString()}</span>
      {Number(item.unit_value_ksh) > 0 && <span className="block text-[10px] text-gray-400">Cost KSh {Number(item.unit_value_ksh).toLocaleString()}</span>}
    </span>
  )
}

function valueCell(item: Awaited<ReturnType<typeof listItems>>[number]) {
  const qty = Number(item.quantity)
  if (item.item_type !== 'finished_good') return <span>Stock KSh {(qty * Number(item.unit_value_ksh)).toLocaleString()}</span>
  return (
    <span>
      Retail KSh {(qty * Number(item.selling_price_ksh)).toLocaleString()}
      <span className="block text-[10px] text-gray-400">Wholesale KSh {(qty * Number(item.wholesale_price_ksh)).toLocaleString()}</span>
      {Number(item.unit_value_ksh) > 0 && <span className="block text-[10px] text-gray-400">Cost KSh {(qty * Number(item.unit_value_ksh)).toLocaleString()}</span>}
    </span>
  )
}

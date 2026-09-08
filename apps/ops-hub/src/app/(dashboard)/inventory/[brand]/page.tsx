import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { resolveBrand } from '@/lib/brands'
import { inventoryCategories } from '@/lib/brandCategories'
import { listItems, listMovements } from '@/lib/inventory'
import { requireSection } from '@/lib/server-auth'
import { InventoryForms } from '@/components/inventory/InventoryForms'
import { InventoryWorkspace } from '@/components/inventory/InventoryWorkspace'
import { inventoryTaxonomy, parseInventoryClassifications } from '@/lib/inventoryTaxonomy'

export const dynamic = 'force-dynamic'

export default async function BrandInventoryPage({ params, searchParams }: {
  params: Promise<{ brand: string }>
  searchParams: Promise<{ classifications?: string | string[]; family?: string }>
}) {
  const actor = await requireSection('inventory')
  const [{ brand: slug }, query] = await Promise.all([params, searchParams])
  const brand = await resolveBrand(slug)
  if (!brand) notFound()
  const allowed = actor.allowedBrandIds('inventory')
  if (allowed !== null && !allowed.includes(brand.id)) redirect('/inventory')

  const [items, movements] = await Promise.all([
    listItems(allowed, brand.id),
    listMovements(allowed, { brandId: brand.id, limit: 150 }),
  ])
  const referenceCostValue = items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_value_ksh), 0)
  const retailSalesValue = items.filter((item) => item.item_type === 'finished_good').reduce((sum, item) => sum + Number(item.quantity) * Number(item.selling_price_ksh), 0)
  const wholesaleSalesValue = items.filter((item) => item.item_type === 'finished_good').reduce((sum, item) => sum + Number(item.quantity) * Number(item.wholesale_price_ksh), 0)
  const available = new Set(items.map((item) => inventoryTaxonomy(item).categoryKey))
  const initialClassifications = parseInventoryClassifications(query.classifications).filter((value) => available.has(value))

  return <div className="space-y-6">
    <Link href="/inventory" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"><ArrowLeft size={15} /> All brands</Link>
    <div className="flex items-center gap-3"><span className="h-4 w-4 rounded-full" style={{ backgroundColor: brand.color_hex }} /><div><h1 className="text-2xl font-semibold text-gray-900">{brand.name} inventory</h1><p className="text-sm text-gray-500">{items.length} items · reference cost value KSh {referenceCostValue.toLocaleString()}{retailSalesValue > 0 ? ` · retail sales value KSh ${retailSalesValue.toLocaleString()}` : ''}{wholesaleSalesValue > 0 ? ` · wholesale sales value KSh ${wholesaleSalesValue.toLocaleString()}` : ''}</p></div></div>

    {actor.can('inventory', 'edit') ? <InventoryForms brandId={brand.id} items={items.map((item) => ({ id: item.id, label: `${item.name}${item.sku ? ` (${item.sku})` : ''}`, unit: item.unit, quantity: Number(item.quantity), itemType: item.item_type, packSize: Number(item.pack_size ?? 1) }))} categories={inventoryCategories(brand.slug)} /> : null}

    <InventoryWorkspace
      brand={{ id: brand.id, slug: brand.slug, name: brand.name }}
      initialItems={items}
      movements={movements}
      initialClassifications={initialClassifications}
      initialFamily={query.family ?? ''}
      canEdit={actor.can('inventory', 'edit')}
    />
  </div>
}

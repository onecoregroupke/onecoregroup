import Link from 'next/link'
import { ArrowUpRight, Boxes, PackageOpen, TriangleAlert } from 'lucide-react'
import { listBrands } from '@/lib/brands'
import { listItems, listMovements } from '@/lib/inventory'
import { scopeBrands } from '@/lib/finance'
import { requireSection } from '@/lib/server-auth'
import { OperationalDocLinks } from '@/components/forms/OperationalDocLinks'

export const dynamic = 'force-dynamic'

/** The stock documents, in the order goods actually travel (§31). */
const INVENTORY_DOCS = [
  { pad: 'grn', label: 'Goods Received Note', hint: 'Goods in from a supplier' },
  { pad: 'gin', label: 'Goods Issue Note', hint: 'Stock out to production or a job' },
  { pad: 'gtn', label: 'Goods Transfer Note', hint: 'Stock moved between stores' },
  { pad: 'delivery', label: 'Delivery Note', hint: 'Stock out to a sales team' },
]

// Inventory home: one card per brand (within the user's compartment), showing
// stock value and low-stock warnings; each opens the brand's own register.
export default async function InventoryPage() {
  const actor = await requireSection('inventory')
  const allowed = actor.allowedBrandIds('inventory')
  // Each pad still sits behind the permission for the ledger it touches; this
  // only decides whether to advertise them here.
  const canRaiseDocs = actor.can('procurement', 'edit') || actor.can('inventory', 'edit')
  const [allBrands, items, movements] = await Promise.all([
    listBrands(),
    listItems(allowed),
    listMovements(allowed, { limit: 12 }),
  ])
  const brands = scopeBrands(allBrands, allowed)
  const itemById = new Map(items.map((i) => [i.id, i]))

  const perBrand = brands.map((brand) => {
    const brandItems = items.filter((i) => i.brand_id === brand.id)
    const totalValue = brandItems.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_value_ksh), 0)
    const low = brandItems.filter((i) => Number(i.reorder_level) > 0 && Number(i.quantity) <= Number(i.reorder_level))
    return { brand, count: brandItems.length, totalValue, low: low.length }
  })
  const grandValue = perBrand.reduce((sum, b) => sum + b.totalValue, 0)
  const lowTotal = perBrand.reduce((sum, b) => sum + b.low, 0)

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Stock control</p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">Inventory</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          {allowed === null
            ? 'Each brand keeps its own stock register. Open a brand to see items, values, and record stock in / out.'
            : `You manage the stock for ${brands.map((b) => b.short_name || b.name).join(', ') || 'no assigned brands'} only.`}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Items tracked" value={items.length} />
        <Stat label="Total stock value" value={grandValue} money />
        <Stat label="Low stock alerts" value={lowTotal} tone={lowTotal ? 'text-amber-600' : 'text-gray-900'} />
      </div>

      <Link href="/inventory/stock-cards"
        className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white p-5 shadow-sm transition-colors hover:border-ocg-gold/40">
        <span>
          <span className="block text-sm font-semibold text-gray-900">Stock card</span>
          <span className="mt-0.5 block text-sm text-gray-500">
            Opening · In · Out · Closing per item for any period, replayed from the movement ledger
            and filterable by brand, store, item type and date.
          </span>
        </span>
        <ArrowUpRight size={16} className="shrink-0 text-gray-300" />
      </Link>

      {/* §31: inventory transaction documents belong in Inventory, not behind a
          generic "Forms" library. Same canonical components, reached from the
          module whose ledger they post to. */}
      {canRaiseDocs && (
        <OperationalDocLinks
          title="Inventory documents"
          hint="The paper pads that move stock. Posting one updates the stock card immediately."
          docs={INVENTORY_DOCS}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {perBrand.map(({ brand, count, totalValue, low }) => (
          <Link key={brand.id} href={`/inventory/${brand.slug}`}
            className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm transition-colors hover:border-ocg-gold/40">
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: `${brand.color_hex}18` }}>
                <Boxes size={18} style={{ color: brand.color_hex }} />
              </span>
              <ArrowUpRight size={16} className="text-gray-300" />
            </div>
            <p className="mt-3 font-semibold text-gray-900">{brand.name}</p>
            <p className="mt-1 text-sm text-gray-500">{count} item{count === 1 ? '' : 's'} · KSh {totalValue.toLocaleString()}</p>
            {low > 0 && (
              <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                <TriangleAlert size={12} /> {low} item{low === 1 ? '' : 's'} at / below reorder level
              </p>
            )}
          </Link>
        ))}
      </div>

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Latest movements</h2>
            <p className="mt-1 text-sm text-gray-500">Most recent stock in / out across your brands.</p>
          </div>
          <PackageOpen size={18} className="text-gray-400" />
        </div>
        {movements.length === 0 ? (
          <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">No stock movements yet.</p>
        ) : (
          <div className="space-y-2">
            {movements.map((m) => {
              const item = itemById.get(m.item_id)
              return (
                <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-50 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-800">{item?.name ?? 'Item'}</p>
                    <p className="text-xs text-gray-400">{m.movement_date} · {m.reason || m.source} · {m.recorded_by || '—'}</p>
                  </div>
                  <span className={`shrink-0 font-semibold ${m.direction === 'in' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {m.direction === 'in' ? '+' : '−'}{Number(m.quantity).toLocaleString()} {item?.unit ?? ''}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value, money = false, tone = 'text-gray-900' }: { label: string; value: number; money?: boolean; tone?: string }) {
  return <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"><p className={`text-3xl font-light ${tone}`}>{money ? `KSh ${value.toLocaleString()}` : value}</p><p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p></div>
}

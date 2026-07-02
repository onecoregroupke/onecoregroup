import Link from 'next/link'
import { ArrowUpRight, Contact, ShoppingCart } from 'lucide-react'
import { listBrands } from '@/lib/brands'
import { listItems } from '@/lib/inventory'
import { listPurchases, listVendors } from '@/lib/procurement'
import { scopeBrands } from '@/lib/finance'
import { requireSection } from '@/lib/server-auth'
import { ProcurementForms } from '@/components/procurement/ProcurementForms'
import { ReceiveButton } from '@/components/procurement/ReceiveButton'

export const dynamic = 'force-dynamic'

const STATUS_STYLES: Record<string, string> = {
  ordered: 'bg-blue-50 text-blue-700',
  received: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-red-50 text-red-500',
}

export default async function ProcurementPage() {
  const actor = await requireSection('procurement')
  const allowed = actor.allowedBrandIds('procurement')
  const canEdit = actor.can('procurement', 'edit')
  const [allBrands, vendors, purchases, inventoryItems] = await Promise.all([
    listBrands(),
    listVendors(),
    listPurchases(allowed),
    // Inventory items feed the purchase line item picker; scope with the same
    // brand compartment so a scoped buyer only links their brand's stock.
    listItems(allowed),
  ])
  const brands = scopeBrands(allBrands, allowed)
  const brandById = new Map(allBrands.map((b) => [b.id, b]))
  const vendorById = new Map(vendors.map((v) => [v.id, v]))

  const openOrders = purchases.filter((p) => p.status === 'ordered')
  const totalSpend = purchases.filter((p) => p.status !== 'cancelled').reduce((sum, p) => sum + Number(p.total_cost_ksh), 0)

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Purchasing</p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">Procurement</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          Record how goods are acquired — vendor, brand, receipt — and receive purchases straight
          into the brand&apos;s inventory register.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Purchases recorded" value={purchases.length} />
        <Stat label="Awaiting delivery" value={openOrders.length} tone={openOrders.length ? 'text-amber-600' : 'text-gray-900'} />
        <Stat label="Total spend" value={totalSpend} money />
      </div>

      {canEdit && (
        <ProcurementForms
          brands={brands.map((b) => ({ id: b.id, label: b.short_name || b.name }))}
          vendors={vendors.map((v) => ({ id: v.id, label: v.name }))}
          inventoryItems={inventoryItems.map((i) => ({ id: i.id, brandId: i.brand_id, label: `${i.name}${i.sku ? ` (${i.sku})` : ''}` }))}
        />
      )}

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Purchases</h2>
              <p className="mt-1 text-sm text-gray-500">Receiving a purchase adds its items to inventory automatically.</p>
            </div>
            <ShoppingCart size={18} className="text-gray-400" />
          </div>
          {purchases.length === 0 ? (
            <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">No purchases recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {purchases.slice(0, 20).map((p) => {
                const brand = brandById.get(p.brand_id)
                return (
                  <div key={p.id} className="rounded-lg border border-gray-100 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-gray-900">
                          <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: brand?.color_hex ?? '#ccc' }} />
                          {vendorById.get(p.vendor_id ?? '')?.name ?? 'Unknown vendor'} · KSh {Number(p.total_cost_ksh).toLocaleString()}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-400">
                          {p.purchase_date} · {brand?.short_name ?? 'Brand'} · {p.reference || 'no reference'} · {p.payment_status}
                          {p.recorded_by ? ` · by ${p.recorded_by}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {p.receipt_url && (
                          <a href={p.receipt_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-ocg-gold hover:text-ocg-navy">
                            Receipt <ArrowUpRight size={12} />
                          </a>
                        )}
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLES[p.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {p.status}
                        </span>
                        {canEdit && p.status === 'ordered' && <ReceiveButton purchaseId={p.id} />}
                      </div>
                    </div>
                    {p.items.length > 0 && (
                      <ul className="mt-2 space-y-0.5 border-t border-gray-50 pt-2 text-xs text-gray-500">
                        {p.items.map((line) => (
                          <li key={line.id}>
                            {Number(line.quantity).toLocaleString()} {line.unit} × {line.description}
                            {Number(line.unit_cost_ksh) > 0 && ` @ KSh ${Number(line.unit_cost_ksh).toLocaleString()}`}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="h-fit rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Vendors</h2>
              <p className="mt-1 text-sm text-gray-500">Suppliers the group buys from.</p>
            </div>
            <Contact size={18} className="text-gray-400" />
          </div>
          {vendors.length === 0 ? (
            <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">No vendors yet — register one above.</p>
          ) : (
            <div className="space-y-2.5">
              {vendors.map((v) => (
                <div key={v.id} className="rounded-lg border border-gray-100 p-3">
                  <p className="text-sm font-medium text-gray-800">{v.name}</p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {[v.contact_person, v.phone, v.email].filter(Boolean).join(' · ') || 'No contact details'}
                    {v.brand_id ? ` · ${brandById.get(v.brand_id)?.short_name ?? ''}` : ' · group-wide'}
                  </p>
                  {v.payment_terms && <p className="mt-1 text-xs text-gray-500">Terms: {v.payment_terms}</p>}
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-gray-400">
            Stock levels live in <Link href="/inventory" className="text-ocg-gold hover:underline">Inventory</Link>.
          </p>
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value, money = false, tone = 'text-gray-900' }: { label: string; value: number; money?: boolean; tone?: string }) {
  return <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"><p className={`text-3xl font-light ${tone}`}>{money ? `KSh ${value.toLocaleString()}` : value}</p><p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p></div>
}

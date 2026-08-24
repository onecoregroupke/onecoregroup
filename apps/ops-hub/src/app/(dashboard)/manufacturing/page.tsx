import Link from 'next/link'
import { Factory, Warehouse, Lightbulb, ArrowUpRight, TriangleAlert } from 'lucide-react'
import { requireSection } from '@/lib/server-auth'
import { listBrands } from '@/lib/brands'
import { listItems } from '@/lib/inventory'
import { scopeBrands } from '@/lib/finance'
import { listStores, listRuns, listFgTransfers, productionSuggestions } from '@/lib/manufacturing'
import { periodBalances } from '@/lib/stockCards'
import { todayInEat } from '@/lib/serverClient'
import { ProductionRunPanel, type ItemOption } from '@/components/inventory/ProductionRunPanel'
import { StorePanel, type StoreItem } from '@/components/inventory/StorePanel'
import { OperationalDocLinks } from '@/components/forms/OperationalDocLinks'

export const dynamic = 'force-dynamic'

const num = (n: number) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 3 })

const STORE_TONE: Record<string, string> = {
  raw: 'text-amber-700 bg-amber-50',
  packaging: 'text-blue-700 bg-blue-50',
  finished_goods: 'text-emerald-700 bg-emerald-50',
  production: 'text-purple-700 bg-purple-50',
  quarantine: 'text-red-700 bg-red-50',
  field_sales: 'text-slate-700 bg-slate-100',
  general: 'text-gray-600 bg-gray-100',
}

/**
 * MANUFACTURING (§§19–28).
 *
 * Raw material → production → packaging → finished goods, all posting through
 * the one stock ledger. The three stores are kept visually and structurally
 * apart so a "total stock" figure can never silently mix ingredients with
 * sellable product.
 */
export default async function ManufacturingPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>
}) {
  const actor = await requireSection('inventory')
  const params = await searchParams
  const allowed = actor.allowedBrandIds('inventory')
  const today = todayInEat()
  const monthStart = `${today.slice(0, 7)}-01`

  const [allBrands, items, stores, runs, transfers, suggestions, balances] = await Promise.all([
    listBrands(),
    listItems(allowed, params.brand),
    listStores(allowed, params.brand),
    listRuns(allowed, { brandId: params.brand, limit: 25 }),
    listFgTransfers(undefined, 15),
    productionSuggestions(allowed, params.brand),
    periodBalances({ allowed, brandId: params.brand, from: monthStart, to: today }),
  ])

  const brands = scopeBrands(allBrands, allowed)
  const itemById = new Map(items.map((i) => [i.id, i]))
  const balanceByItem = new Map(balances.map((b) => [b.item_id, b]))

  const byType = (t: string) => items.filter((i) => i.item_type === t)
  const rawItems = byType('raw_material')
  const packagingItems = byType('packaging')
  const finishedItems = byType('finished_good')

  const toOption = (i: (typeof items)[number]): ItemOption => ({
    id: i.id,
    label: `${i.name}${i.sku ? ` (${i.sku})` : ''}`,
    unit: i.unit,
    itemType: i.item_type,
    onHand: Number(i.quantity ?? 0),
  })

  // Flatten to the serialisable shape the client panel renders. Stock figures
  // are passed through untouched — the panel only decides how many rows to show.
  const toStoreItem = (i: (typeof items)[number]): StoreItem => {
    const bal = balanceByItem.get(i.id)
    return {
      id: i.id,
      name: i.name,
      sku: i.sku ?? '',
      unit: i.unit,
      quantity: Number(i.quantity ?? 0),
      minimumStock: Number(i.minimum_stock ?? 0),
      reorderLevel: Number(i.reorder_level ?? 0),
      opening: bal ? bal.opening : null,
      quantityIn: bal ? bal.quantity_in : null,
      quantityOut: bal ? bal.quantity_out : null,
    }
  }

  const activeRuns = runs.filter((r) => !['completed', 'closed', 'cancelled'].includes(r.status))
  const producedThisMonth = balances
    .filter((b) => finishedItems.some((f) => f.id === b.item_id))
    .reduce((sum, b) => sum + b.quantity_in, 0)

  const unclassified = items.filter((i) => !i.item_type || i.item_type === 'consumable').length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Production</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-gray-900">
            <Factory size={22} className="text-gray-400" /> Manufacturing
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Raw materials and packaging in, finished goods out. Issuing materials deducts them from
            store; only accepted output is added back, so rejected units never become sellable stock.
          </p>
        </div>
        <Link href="/inventory/stock-cards"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:border-ocg-gold/40">
          Stock card <ArrowUpRight size={14} />
        </Link>
      </div>

      <ProductionRunPanel
        brands={brands.map((b) => ({ id: b.id, label: b.name }))}
        products={finishedItems.map(toOption)}
        materials={[...rawItems, ...packagingItems].map(toOption)}
        stores={stores.filter((s) => s.store_type === 'finished_goods' || s.store_type === 'general')
          .map((s) => ({ id: s.id, label: s.name }))}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active runs" value={String(activeRuns.length)} />
        <Stat label="Produced this month" value={num(producedThisMonth)} tone="text-emerald-600" />
        <Stat label="Finished SKUs" value={String(finishedItems.length)} />
        <Stat label="Production suggestions" value={String(suggestions.length)} tone={suggestions.length ? 'text-amber-600' : 'text-gray-900'} />
      </div>

      {unclassified > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" />
          <span>
            <strong>{unclassified}</strong> item{unclassified === 1 ? ' is' : 's are'} still unclassified
            (item type &ldquo;consumable&rdquo;). Classify them as raw material, packaging or finished
            good so they appear in the right store and in production planning.
          </span>
        </p>
      )}

      {/* §31: Material Requisition is a production document, so it is reachable
          from Production rather than only from a generic forms library. The
          brand in view is carried through, so the pad opens already bound to it. */}
      {actor.can('procurement', 'edit') && (
        <OperationalDocLinks
          title="Production documents"
          hint="Request material, issue it to a run, and move finished goods — each posts straight to the stock ledger."
          brand={params.brand}
          docs={[
            { pad: 'mrf', label: 'Material Requisition', hint: 'Request material for a production run' },
            { pad: 'gin', label: 'Goods / Raw Material Issue Note', hint: 'Issue material out to production' },
            { pad: 'gtn', label: 'Goods Transfer Note', hint: 'Move stock between stores' },
          ]}
        />
      )}

      {/* ── The three stores, kept apart ───────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <StorePanel title="Raw material store" tone="raw" items={rawItems.map(toStoreItem)} />
        <StorePanel title="Packaging store" tone="packaging" items={packagingItems.map(toStoreItem)} />
        <StorePanel title="Finished goods store" tone="finished_goods" items={finishedItems.map(toStoreItem)} />
      </div>

      {suggestions.length > 0 && (
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Lightbulb size={15} className="text-amber-500" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">What to make next</h2>
          </div>
          <p className="mb-3 text-xs text-gray-500">
            System <strong>suggestions</strong>, not production orders. A manager approves one into a
            real run — nothing here starts production by itself.
          </p>
          <div className="space-y-2">
            {suggestions.slice(0, 8).map((s) => (
              <div key={s.item_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-800">{s.name}</p>
                  <p className="text-xs text-gray-400">
                    {num(s.usableStock)} usable · shortfall {num(s.shortfall)}
                    {s.blocked && <span className="text-red-600"> · blocked on materials</span>}
                  </p>
                </div>
                <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
                  s.action === 'urgent' ? 'bg-red-50 text-red-700'
                    : s.action === 'plan_production' ? 'bg-amber-50 text-amber-700'
                      : 'bg-gray-100 text-gray-500'
                }`}>
                  make {num(s.suggestedQuantity)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Recent production runs</h2>
          {runs.length === 0 ? (
            <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
              No production runs yet. Start one above.
            </p>
          ) : (
            <div className="space-y-2">
              {runs.slice(0, 10).map((r) => {
                const item = r.product_item_id ? itemById.get(r.product_item_id) : null
                return (
                  <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-800">
                        {r.run_ref}{item ? ` · ${item.name}` : ''}
                      </p>
                      <p className="text-xs text-gray-400">
                        planned {num(r.planned_quantity)}
                        {r.actual_quantity > 0 && ` · made ${num(r.actual_quantity)}`}
                        {r.rejected_quantity > 0 && ` · rejected ${num(r.rejected_quantity)}`}
                        {r.batch_number && ` · batch ${r.batch_number}`}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium capitalize ${
                      r.status === 'completed' ? 'bg-emerald-50 text-emerald-700'
                        : r.status === 'cancelled' || r.status === 'rejected' ? 'bg-red-50 text-red-600'
                          : 'bg-amber-50 text-amber-700'
                    }`}>{r.status.replace(/_/g, ' ')}</span>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Finished-goods transfers</h2>
          {transfers.length === 0 ? (
            <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">Nothing transferred yet.</p>
          ) : (
            <div className="space-y-2">
              {transfers.map((t) => {
                const item = itemById.get(t.item_id)
                return (
                  <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-800">{t.transfer_ref}{item ? ` · ${item.name}` : ''}</p>
                      <p className="text-xs text-gray-400">
                        made {num(t.produced_quantity)} · accepted {num(t.accepted_quantity)}
                        {t.rejected_quantity > 0 && ` · rejected ${num(t.rejected_quantity)}`}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium ${
                      t.status === 'posted' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                    }`}>{t.status}</span>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {stores.length > 0 && (
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Warehouse size={15} className="text-gray-400" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Stores</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {stores.map((s) => (
              <span key={s.id} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${STORE_TONE[s.store_type] ?? STORE_TONE['general']}`}>
                {s.name}{s.location ? ` · ${s.location}` : ''}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function Stat({ label, value, tone = 'text-gray-900' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className={`text-3xl font-light tabular-nums ${tone}`}>{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
    </div>
  )
}

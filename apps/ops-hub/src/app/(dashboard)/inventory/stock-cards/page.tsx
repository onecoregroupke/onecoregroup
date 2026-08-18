import Link from 'next/link'
import { ArrowLeft, TriangleAlert, Layers } from 'lucide-react'
import { requireSection } from '@/lib/server-auth'
import { listBrands } from '@/lib/brands'
import { listItems } from '@/lib/inventory'
import { listStores } from '@/lib/manufacturing'
import { periodBalances, listStockCardRows, summariseBalances } from '@/lib/stockCards'
import { scopeBrands } from '@/lib/finance'
import { todayInEat } from '@/lib/serverClient'
import { StockFilterBar } from '@/components/inventory/StockFilterBar'

export const dynamic = 'force-dynamic'

const num = (n: number) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 3 })

/** Default window: the current month to date. */
function defaultWindow(): { from: string; to: string } {
  const to = todayInEat()
  return { from: `${to.slice(0, 7)}-01`, to }
}

/**
 * STOCK CARD (§30) — Opening · In · Out · Closing, per item, for a window.
 *
 * Everything here is derived from `inventory_stock_cards`, a VIEW over the
 * movement ledger, so these figures cannot be hand-edited and cannot drift from
 * the movements behind them. The `drift` column deliberately surfaces the one
 * case where they CAN disagree: if the replayed ledger closing differs from
 * inventory_items.quantity, somebody needs to know rather than be reassured.
 */
export default async function StockCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; store?: string; item?: string; type?: string; from?: string; to?: string }>
}) {
  const actor = await requireSection('inventory')
  const params = await searchParams
  const allowed = actor.allowedBrandIds('inventory')
  const win = defaultWindow()
  const from = params.from || win.from
  const to = params.to || win.to

  const filter = {
    allowed,
    brandId: params.brand,
    storeId: params.store,
    itemId: params.item,
    itemType: params.type,
    from,
    to,
  }

  const [allBrands, items, stores, balances, ledger] = await Promise.all([
    listBrands(),
    listItems(allowed),
    listStores(allowed, params.brand),
    periodBalances(filter),
    // The line-by-line card only makes sense once a single item is chosen —
    // otherwise it is just the whole ledger interleaved.
    params.item ? listStockCardRows({ ...filter, limit: 300 }) : Promise.resolve([]),
  ])

  const brands = scopeBrands(allBrands, allowed)
  const brandName = new Map(allBrands.map((b) => [b.id, b.short_name || b.name]))
  const withMovement = balances.filter((b) => b.movements > 0 || b.opening !== 0 || b.closing !== 0)
  const totals = summariseBalances(withMovement)
  const selectedItem = params.item ? items.find((i) => i.id === params.item) : null

  return (
    <div className="space-y-5">
      <div>
        <Link href="/inventory" className="mb-2 inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700">
          <ArrowLeft size={13} /> Inventory
        </Link>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Stock control · Stock card</p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">Stock card</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          Opening, in, out and closing balance per item for {from} → {to}. Every figure is replayed
          from the movement ledger, so it can be traced line by line to the document that caused it.
        </p>
      </div>

      <StockFilterBar
        brands={brands.map((b) => ({ value: b.id, label: b.name }))}
        stores={stores.map((s) => ({ value: s.id, label: s.name }))}
        items={items.map((i) => ({ value: i.id, label: `${i.name}${i.sku ? ` (${i.sku})` : ''}` }))}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Items" value={num(totals.items)} />
        <Stat label="Opening" value={num(totals.opening)} />
        <Stat label="In" value={`+${num(totals.quantity_in)}`} tone="text-emerald-600" />
        <Stat label="Out" value={`−${num(totals.quantity_out)}`} tone="text-red-600" />
        <Stat label="Closing" value={num(totals.closing)} />
      </div>

      {totals.drifting > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" />
          <span>
            <strong>{totals.drifting}</strong> item{totals.drifting === 1 ? '' : 's'} where the replayed
            ledger closing does not equal the item&apos;s recorded quantity. See the Drift column — this
            means a quantity was changed outside the ledger and needs investigating.
          </span>
        </p>
      )}

      <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Balances</h2>
          <span className="text-xs text-gray-400">{withMovement.length} of {balances.length} items</span>
        </div>
        {withMovement.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No stock movement in this window.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-[10px] uppercase tracking-wider text-gray-400">
                  <Th className="text-left">Item</Th>
                  <Th className="text-left">Type</Th>
                  <Th>Opening</Th>
                  <Th>In</Th>
                  <Th>Out</Th>
                  <Th>Closing</Th>
                  <Th>Current</Th>
                  <Th>Drift</Th>
                  <Th>Value</Th>
                </tr>
              </thead>
              <tbody>
                {withMovement.map((b) => (
                  <tr key={b.item_id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                    <Td className="text-left">
                      <Link href={`/inventory/stock-cards?item=${b.item_id}&from=${from}&to=${to}`}
                        className="font-medium text-gray-800 hover:text-ocg-gold">
                        {b.item_name}
                      </Link>
                      <span className="block text-xs text-gray-400">
                        {b.sku || '—'}{b.brand_id ? ` · ${brandName.get(b.brand_id) ?? ''}` : ''} · {b.unit}
                      </span>
                    </Td>
                    <Td className="text-left">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] capitalize text-gray-600">
                        {(b.item_type || 'consumable').replace(/_/g, ' ')}
                      </span>
                    </Td>
                    <Td className="tabular-nums text-gray-600">{num(b.opening)}</Td>
                    <Td className="tabular-nums font-medium text-emerald-600">{b.quantity_in ? `+${num(b.quantity_in)}` : '—'}</Td>
                    <Td className="tabular-nums font-medium text-red-600">{b.quantity_out ? `−${num(b.quantity_out)}` : '—'}</Td>
                    <Td className="tabular-nums font-semibold text-gray-900">{num(b.closing)}</Td>
                    <Td className="tabular-nums text-gray-500">{num(b.current)}</Td>
                    <Td className={`tabular-nums ${Math.abs(b.drift) > 0.001 ? 'font-semibold text-amber-600' : 'text-gray-300'}`}>
                      {Math.abs(b.drift) > 0.001 ? num(b.drift) : '—'}
                    </Td>
                    <Td className="tabular-nums text-gray-600">KSh {num(b.value_ksh)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedItem && (
        <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
            <Layers size={14} className="text-gray-400" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">
              Movement history · {selectedItem.name}
            </h2>
          </div>
          {ledger.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">No movements for this item in the window.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-[10px] uppercase tracking-wider text-gray-400">
                    <Th className="text-left">Date</Th>
                    <Th className="text-left">Source document</Th>
                    <Th className="text-left">Reference</Th>
                    <Th>In</Th>
                    <Th>Out</Th>
                    <Th>Balance</Th>
                    <Th className="text-left">By</Th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((m) => (
                    <tr key={m.movement_id} className="border-b border-gray-50 last:border-0">
                      <Td className="text-left text-gray-600">{m.movement_date}</Td>
                      <Td className="text-left">
                        <span className="text-gray-800">{m.source_document_type}</span>
                        {m.reason && <span className="block text-xs text-gray-400">{m.reason}</span>}
                      </Td>
                      <Td className="text-left text-xs text-gray-500">
                        {m.reference || '—'}
                        {m.batch_number && <span className="block text-gray-400">batch {m.batch_number}</span>}
                      </Td>
                      <Td className="tabular-nums font-medium text-emerald-600">{m.quantity_in ? `+${num(m.quantity_in)}` : ''}</Td>
                      <Td className="tabular-nums font-medium text-red-600">{m.quantity_out ? `−${num(m.quantity_out)}` : ''}</Td>
                      <Td className="tabular-nums font-semibold text-gray-900">
                        {num(m.running_balance)}
                        {Math.abs(m.running_balance - m.recorded_balance) > 0.001 && (
                          <span className="block text-[10px] font-normal text-amber-600">
                            recorded {num(m.recorded_balance)}
                          </span>
                        )}
                      </Td>
                      <Td className="text-left text-xs text-gray-400">{m.actioned_by || '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function Stat({ label, value, tone = 'text-gray-900' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className={`text-2xl font-light tabular-nums ${tone}`}>{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
    </div>
  )
}

function Th({ children, className = 'text-right' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-2 font-semibold ${className}`}>{children}</th>
}

function Td({ children, className = 'text-right' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 align-top ${className}`}>{children}</td>
}

import Link from 'next/link'
import { Suspense } from 'react'
import { ArrowLeft, TriangleAlert, Layers } from 'lucide-react'
import { requireSection } from '@/lib/server-auth'
import { listBrands } from '@/lib/brands'
import { listItems } from '@/lib/inventory'
import { listStores } from '@/lib/manufacturing'
import { periodBalances, listStockCardRows, summariseBalances, type PeriodBalance } from '@/lib/stockCards'
import { scopeBrands } from '@/lib/finance'
import { todayInEat } from '@/lib/serverClient'
import { StockFilterBar } from '@/components/inventory/StockFilterBar'
import { FinishedGoodsQuantity } from '@/components/inventory/FinishedGoodsQuantity'
import { filterInventoryByTaxonomy, inventoryTaxonomy, inventoryTaxonomyOptions } from '@/lib/inventoryTaxonomy'
import { formatPackageConfiguration } from '@/lib/finishedGoodsQuantity'
import type { InventoryItemRow } from '@ocg/db'

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
  searchParams: Promise<{
    brand?: string; store?: string; item?: string; type?: string; category?: string
    subcategory?: string; family?: string; pack?: string; from?: string; to?: string
  }>
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
    listItems(allowed, params.brand),
    listStores(allowed, params.brand),
    periodBalances(filter),
    // The line-by-line card only makes sense once a single item is chosen —
    // otherwise it is just the whole ledger interleaved.
    params.item ? listStockCardRows({ ...filter, limit: 300 }) : Promise.resolve([]),
  ])

  const brands = scopeBrands(allBrands, allowed)
  const brandName = new Map(allBrands.map((b) => [b.id, b.short_name || b.name]))
  const baseItems = items.filter((item) => (!params.store || item.store_id === params.store) && (!params.type || item.item_type === params.type))
  const taxonomyFilter = { category: params.category, subcategory: params.subcategory, family: params.family, pack: params.pack }
  const taxonomyOptions = inventoryTaxonomyOptions(baseItems, taxonomyFilter)
  const filteredItems = filterInventoryByTaxonomy(baseItems, taxonomyFilter)
  const filteredIds = new Set(filteredItems.map((item) => item.id))
  const withMovement = balances.filter((b) => filteredIds.has(b.item_id) && (b.movements > 0 || b.opening !== 0 || b.closing !== 0))
  const totals = summariseBalances(withMovement)
  const selectedItem = params.item ? items.find((i) => i.id === params.item) : null
  const units = new Set(withMovement.map((balance) => balance.base_unit || balance.unit).filter(Boolean))
  const compatibleUnit = units.size === 1 ? [...units][0]! : null
  const overview = categoryOverview(withMovement, Boolean(params.category))

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

      <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-gray-100" />}>
        <StockFilterBar
          brands={brands.map((b) => ({ value: b.id, label: b.name }))}
          stores={stores.map((s) => ({ value: s.id, label: s.name }))}
          categories={taxonomyOptions.categories.map((option) => ({ value: option.value, label: `${option.label} (${option.count})` }))}
          subcategories={(params.category ? taxonomyOptions.subcategories : []).map((option) => ({ value: option.value, label: `${option.label} (${option.count})` }))}
          families={(params.category || params.type === 'finished_good' ? taxonomyOptions.families : []).map((option) => ({ value: option.value, label: `${option.label} (${option.count})` }))}
          packs={(params.family || params.subcategory ? taxonomyOptions.packs : []).map((option) => ({ value: option.value, label: `${formatPackageConfiguration(option.label)} (${option.count})` }))}
          items={(params.type || params.store || params.category || params.family || params.pack
            ? filteredItems.map((item) => ({ value: item.id, label: `${item.name}${item.sku ? ` (${item.sku})` : ''}` }))
            : [])}
        />
      </Suspense>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Items" value={num(totals.items)} />
        <Stat label="Opening" value={compatibleUnit ? `${num(totals.opening)} ${compatibleUnit}` : 'Mixed units'} />
        <Stat label="In" value={compatibleUnit ? `+${num(totals.quantity_in)} ${compatibleUnit}` : 'Mixed units'} tone="text-emerald-600" />
        <Stat label="Out" value={compatibleUnit ? `−${num(totals.quantity_out)} ${compatibleUnit}` : 'Mixed units'} tone="text-red-600" />
        <Stat label="Closing" value={compatibleUnit ? `${num(totals.closing)} ${compatibleUnit}` : 'Mixed units'} />
      </div>

      {!selectedItem && overview.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Category overview</h2>
            <p className="mt-1 text-xs text-gray-400">A navigation layer above the same item ledger; mixed units are never added together.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100 bg-gray-50 text-[10px] uppercase tracking-wider text-gray-400">
                <Th className="text-left">Category / family</Th><Th>SKUs</Th><Th>Opening</Th><Th>In</Th><Th>Out</Th><Th>Closing</Th>
              </tr></thead>
              <tbody>
                {overview.map((group) => (
                  <tr key={group.key} className="border-b border-gray-50 last:border-0">
                    <Td className="text-left">
                      <Link href={stockCardHref(params, group.filter)} className="font-medium text-gray-800 hover:text-ocg-gold">{group.label}</Link>
                    </Td>
                    <Td>{group.rows.length}</Td>
                    <Td>{group.unit ? `${num(group.opening)} ${group.unit}` : 'Mixed units'}</Td>
                    <Td>{group.unit ? `+${num(group.quantityIn)} ${group.unit}` : '—'}</Td>
                    <Td>{group.unit ? `−${num(group.quantityOut)} ${group.unit}` : '—'}</Td>
                    <Td className="font-semibold">{group.unit ? `${num(group.closing)} ${group.unit}` : '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

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
                      <Link href={stockCardHref(params, { item: b.item_id })}
                        className="font-medium text-gray-800 hover:text-ocg-gold">
                        {b.item_name}
                      </Link>
                      <span className="block text-xs text-gray-400">
                        {b.sku || '—'}{b.brand_id ? ` · ${brandName.get(b.brand_id) ?? ''}` : ''} · {b.unit}
                      </span>
                      <span className="block text-[10px] text-gray-400">{inventoryTaxonomy(b).category} · {inventoryTaxonomy(b).subcategory || inventoryTaxonomy(b).family || 'Unclassified'}</span>
                    </Td>
                    <Td className="text-left">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] capitalize text-gray-600">
                        {(b.item_type || 'consumable').replace(/_/g, ' ')}
                      </span>
                    </Td>
                    <Td className="tabular-nums text-gray-600"><StockBalanceQuantity balance={b} value={b.opening} /></Td>
                    <Td className="tabular-nums font-medium text-emerald-600">{b.quantity_in ? <StockBalanceQuantity balance={b} value={b.quantity_in} prefix="+" /> : '—'}</Td>
                    <Td className="tabular-nums font-medium text-red-600">{b.quantity_out ? <StockBalanceQuantity balance={b} value={b.quantity_out} prefix="−" /> : '—'}</Td>
                    <Td className="tabular-nums font-semibold text-gray-900"><StockBalanceQuantity balance={b} value={b.closing} /></Td>
                    <Td className="tabular-nums text-gray-500"><StockBalanceQuantity balance={b} value={b.current} /></Td>
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
          <div className="border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-xs text-gray-500">
            <span className="font-medium text-gray-700">{selectedItem.product_family || selectedItem.name}</span>
            {selectedItem.package_config && <> · {formatPackageConfiguration(selectedItem.package_config)}</>}
            {selectedItem.item_type === 'finished_good' && Number(selectedItem.pack_size) > 1 && <> · {Number(selectedItem.pack_size)} pieces per carton</>}
            {selectedItem.item_type === 'packaging' && <> · {inventoryTaxonomy(selectedItem).category} · {inventoryTaxonomy(selectedItem).subcategory}</>}
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
                      <Td className="tabular-nums font-medium text-emerald-600">{m.quantity_in ? <ItemQuantity item={selectedItem} value={m.quantity_in} prefix="+" /> : ''}</Td>
                      <Td className="tabular-nums font-medium text-red-600">{m.quantity_out ? <ItemQuantity item={selectedItem} value={m.quantity_out} prefix="−" /> : ''}</Td>
                      <Td className="tabular-nums font-semibold text-gray-900">
                        <ItemQuantity item={selectedItem} value={m.running_balance} />
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

function StockBalanceQuantity({ balance, value, prefix = '' }: { balance: PeriodBalance; value: number; prefix?: string }) {
  if (balance.item_type !== 'finished_good') return <>{prefix}{num(value)}</>
  return <span>{prefix}<FinishedGoodsQuantity totalPieces={value} packSize={balance.pack_size} compact /></span>
}

function ItemQuantity({ item, value, prefix = '' }: { item: InventoryItemRow; value: number; prefix?: string }) {
  if (item.item_type !== 'finished_good') return <>{prefix}{num(value)}</>
  return <span>{prefix}<FinishedGoodsQuantity totalPieces={value} packSize={Number(item.pack_size ?? 1)} compact /></span>
}

function categoryOverview(rows: PeriodBalance[], drillIntoSubcategories: boolean) {
  const groups = new Map<string, { key: string; label: string; filter: Record<string, string>; rows: PeriodBalance[] }>()
  for (const row of rows) {
    const taxonomy = inventoryTaxonomy(row)
    const isFinished = row.item_type === 'finished_good'
    const useSubcategory = !isFinished && drillIntoSubcategories
    const label = isFinished
      ? taxonomy.family || 'Other / Unclassified'
      : useSubcategory ? taxonomy.subcategory : taxonomy.category
    const groupingValue = isFinished ? taxonomy.family : useSubcategory ? taxonomy.subcategoryKey : taxonomy.categoryKey
    const groupKey = `${row.item_type}:${groupingValue}`
    const group = groups.get(groupKey) ?? {
      key: groupKey,
      label,
      filter: isFinished
        ? { type: row.item_type, family: taxonomy.family }
        : useSubcategory
          ? { type: row.item_type, category: taxonomy.categoryKey, subcategory: taxonomy.subcategoryKey }
          : { type: row.item_type, category: taxonomy.categoryKey },
      rows: [],
    }
    group.rows.push(row)
    groups.set(groupKey, group)
  }
  return [...groups.values()].map((group) => {
    const units = new Set(group.rows.map((row) => row.base_unit || row.unit).filter(Boolean))
    const unit = units.size === 1 ? [...units][0]! : null
    return {
      ...group,
      unit,
      opening: group.rows.reduce((sum, row) => sum + row.opening, 0),
      quantityIn: group.rows.reduce((sum, row) => sum + row.quantity_in, 0),
      quantityOut: group.rows.reduce((sum, row) => sum + row.quantity_out, 0),
      closing: group.rows.reduce((sum, row) => sum + row.closing, 0),
    }
  }).sort((a, b) => a.label.localeCompare(b.label))
}

function stockCardHref(
  current: Record<string, string | undefined>,
  changes: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(current)) if (value) params.set(key, value)
  for (const [key, value] of Object.entries(changes)) {
    if (value) params.set(key, value)
    else params.delete(key)
  }
  if ('category' in changes || 'family' in changes || 'type' in changes) {
    params.delete('subcategory'); params.delete('pack'); params.delete('item')
  }
  return `/inventory/stock-cards?${params.toString()}`
}

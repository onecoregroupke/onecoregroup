import Link from 'next/link'
import { Factory, Warehouse, Lightbulb, ArrowUpRight, TriangleAlert } from 'lucide-react'
import { requireSection } from '@/lib/server-auth'
import { listBrands } from '@/lib/brands'
import { listItems } from '@/lib/inventory'
import { scopeBrands } from '@/lib/finance'
import { listStores, listRuns, listFgTransfers, productionSuggestions, listBomForProducts, productionRunSummary } from '@/lib/manufacturing'
import { periodBalances } from '@/lib/stockCards'
import { inventoryHealthReport } from '@/lib/inventoryHealth'
import { PACKAGING_ROLE_LABELS } from '@/lib/inventoryTaxonomy'
import { finishedGoodsQuantity, formatPackageConfiguration } from '@/lib/finishedGoodsQuantity'
import { todayInEat } from '@/lib/serverClient'
import { ProductionRunPanel, type ItemOption } from '@/components/inventory/ProductionRunPanel'
import { StorePanel, type StoreItem } from '@/components/inventory/StorePanel'
import { FinishedGoodsQuantity } from '@/components/inventory/FinishedGoodsQuantity'
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
 * Production records plans, execution and variances. Only posted operational
 * documents move stock: GIN for material store-out, GTN for accepted finished
 * goods into the destination store.
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
  const bomLines = await listBomForProducts(finishedItems.map((item) => item.id))
  const runSummaries = new Map((await Promise.all(runs.map(async (run) => [run.id, await productionRunSummary(run.id)] as const))).map((entry) => entry))
  const health = inventoryHealthReport(items, stores, bomLines)
  const usedBy = new Map<string, string[]>()
  const requirements = new Map<string, StoreItem['requirements']>()
  for (const line of bomLines) {
    const product = itemById.get(line.product_item_id)
    const component = itemById.get(line.component_item_id)
    if (!product || !component || component.item_type !== 'packaging') continue
    const productLabel = `${product.product_family || product.name}${product.package_config ? ` · ${formatPackageConfiguration(product.package_config)}` : ''}`
    usedBy.set(component.id, [...new Set([...(usedBy.get(component.id) ?? []), productLabel])])
    requirements.set(product.id, [...(requirements.get(product.id) ?? []), {
      id: line.id,
      componentName: component.name,
      role: PACKAGING_ROLE_LABELS[component.packaging_role] ?? 'Other Packaging',
      selectionMode: line.selection_mode || 'all_required',
      requirementGroup: line.requirement_group || line.id,
      onHand: Number(component.quantity ?? 0),
      unit: component.base_unit || component.unit,
      quantityPerUnit: Number(line.quantity_per_unit ?? 1),
    }])
  }

  const toOption = (i: (typeof items)[number]): ItemOption => ({
    id: i.id,
    label: `${i.name}${i.sku ? ` (${i.sku})` : ''}`,
    unit: i.unit,
    itemType: i.item_type,
    onHand: Number(i.quantity ?? 0),
    packSize: Number(i.pack_size ?? 1),
    packageConfig: i.package_config,
    requirements: requirements.get(i.id) ?? [],
  })

  // Flatten to the serialisable shape the client panel renders. Stock figures
  // are passed through untouched — the panel only decides how many rows to show.
  const toStoreItem = (i: (typeof items)[number]): StoreItem => {
    const bal = balanceByItem.get(i.id)
    return {
      id: i.id,
      name: i.name,
      canonical_name: i.canonical_name,
      sku: i.sku ?? '',
      unit: i.unit,
      base_unit: i.base_unit || i.unit,
      item_type: i.item_type,
      category: i.category,
      product_family: i.product_family,
      size_label: i.size_label,
      package_config: i.package_config,
      pack_size: Number(i.pack_size ?? 1),
      packaging_role: i.packaging_role,
      store_id: i.store_id,
      quantity: Number(i.quantity ?? 0),
      minimumStock: Number(i.minimum_stock ?? 0),
      reorderLevel: Number(i.reorder_level ?? 0),
      opening: bal ? bal.opening : null,
      quantityIn: bal ? bal.quantity_in : null,
      quantityOut: bal ? bal.quantity_out : null,
      usedBy: usedBy.get(i.id) ?? [],
      requirements: requirements.get(i.id) ?? [],
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
            Plan and reconcile production here. An approved MRF does not move stock; posting its GIN
            issues materials, and a linked GTN receives accepted output into finished goods.
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
        runs={activeRuns.map((run) => ({
          id: run.id,
          label: `${run.run_ref}${itemById.get(run.product_item_id ?? '') ? ` · ${itemById.get(run.product_item_id ?? '')!.name}` : ''}`,
          productItemId: run.product_item_id,
          actualQuantity: Number(run.actual_quantity ?? 0),
          acceptedQuantity: Number(run.accepted_quantity ?? 0),
          rejectedQuantity: Number(run.rejected_quantity ?? 0),
          wasteQuantity: Number(run.waste_quantity ?? 0),
        }))}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active runs" value={String(activeRuns.length)} />
        <Stat label="FG received this month" value={`${num(producedThisMonth)} pcs`} tone="text-emerald-600" />
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

      {(health.problems.packagingWithoutRole.length > 0 || health.problems.wrongStore.length > 0
        || health.problems.invalidPackSize.length > 0) && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" />
          <span>
            Inventory health check: {health.problems.packagingWithoutRole.length} packaging role issue(s),{' '}
            {health.problems.wrongStore.length} store assignment issue(s), and{' '}
            {health.problems.invalidPackSize.length} pack-size issue(s). Unclassified records stay visible for controlled cleanup.
          </span>
        </p>
      )}

      {/* §31: Material Requisition is a production document, so it is reachable
          from Production rather than only from a generic forms library. The
          brand in view is carried through, so the pad opens already bound to it. */}
      {actor.can('procurement', 'edit') && (
        <OperationalDocLinks
          title="Production documents"
          hint="MRF records demand only. The posted GIN moves materials out; the posted GTN receives accepted output."
          brand={params.brand}
          docs={[
            { pad: 'mrf', label: 'Material Requisition', hint: 'Request material for a production run' },
            { pad: 'gin', label: 'Goods / Raw Material Issue Note', hint: 'Normally generated from an approved MRF' },
            { pad: 'gtn', label: 'Goods Transfer Note', hint: 'Receive accepted production output into finished goods' },
          ]}
        />
      )}

      {/* ── The three stores, kept apart ───────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-3">
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
                    {(() => {
                      const quantity = finishedGoodsQuantity(s.usableStock, Number(s.item.pack_size ?? 1))
                      return `${quantity.totalLabel}${quantity.cartonLabel ? ` · ${quantity.cartonLabel}` : ''}`
                    })()} usable · shortfall {num(s.shortfall)} pieces
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
                const summary = runSummaries.get(r.id)
                return (
                  <div key={r.id} className="rounded-lg border border-gray-100 px-3 py-2 text-sm">
                    <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-800">
                        {r.run_ref}{item ? ` · ${item.name}` : ''}
                      </p>
                      <p className="text-xs text-gray-400">
                        planned {num(r.planned_quantity)} pieces
                        {r.actual_quantity > 0 && ` · made ${num(r.actual_quantity)} pieces · accepted ${num(r.accepted_quantity)} pieces`}
                        {r.rejected_quantity > 0 && ` · rejected ${num(r.rejected_quantity)} pieces`}
                        {r.batch_number && ` · batch ${r.batch_number}`}
                      </p>
                      {item && <FinishedGoodsQuantity totalPieces={Number(r.planned_quantity)} packSize={Number(item.pack_size ?? 1)} compact className="mt-0.5 text-[11px] text-gray-500" />}
                    </div>
                    <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium capitalize ${
                      r.status === 'completed' ? 'bg-emerald-50 text-emerald-700'
                        : r.status === 'cancelled' || r.status === 'rejected' ? 'bg-red-50 text-red-600'
                          : 'bg-amber-50 text-amber-700'
                    }`}>{r.status.replace(/_/g, ' ')}</span>
                    </div>
                    {summary && (
                      <div className="mt-2 border-t border-gray-100 pt-2 text-[11px] text-gray-500">
                        <p><strong className="text-gray-700">GTN:</strong> {num(summary.transferred)} transferred · {num(summary.awaitingTransfer)} awaiting transfer</p>
                        <p className="mt-1"><strong className="text-gray-700">Linked documents:</strong>{' '}
                          MRF {summary.mrfs.map((doc) => doc.reference ?? 'draft').join(', ') || 'none'} · GIN {summary.gins.map((doc) => doc.document_number || doc.reference || 'draft').join(', ') || 'none'} · GTN {summary.gtns.map((doc) => doc.document_number || doc.reference || 'draft').join(', ') || 'none'}
                        </p>
                        {summary.materials.length > 0 && <p className="mt-1"><strong className="text-gray-700">GIN materials:</strong> {summary.materials.map((line) => `${line.item?.name ?? 'Item'} ${num(line.issued)}/${num(line.expected)} (${line.variance >= 0 ? '+' : ''}${num(line.variance)})`).join(' · ')}</p>}
                        <div className="mt-1 flex gap-3">
                          <Link className="font-medium text-ocg-gold hover:underline" href={`/forms/operations?pad=mrf&brand=${r.brand_id ?? ''}&run=${r.id}`}>Raise MRF</Link>
                          <Link className="font-medium text-ocg-gold hover:underline" href={`/forms/operations?pad=gtn&brand=${r.brand_id ?? ''}&run=${r.id}`}>Raise GTN</Link>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Legacy production transfers · read only</h2>
          <p className="mb-3 text-xs text-gray-500">Historical FGT rows are preserved for audit. New finished-goods receipts use GTNs.</p>
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
                        made {num(t.produced_quantity)} pieces · accepted {num(t.accepted_quantity)} pieces
                        {t.rejected_quantity > 0 && ` · rejected ${num(t.rejected_quantity)} pieces`}
                      </p>
                      {item && <FinishedGoodsQuantity totalPieces={Number(t.accepted_quantity)} packSize={Number(item.pack_size ?? 1)} compact className="mt-0.5 text-[11px] text-gray-500" />}
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

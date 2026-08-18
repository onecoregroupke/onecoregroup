import Link from 'next/link'
import { Truck, ArrowUpRight, TriangleAlert } from 'lucide-react'
import { requireSection } from '@/lib/server-auth'
import { listBrands } from '@/lib/brands'
import { listTeam } from '@/lib/team'
import { listItems } from '@/lib/inventory'
import { scopeBrands } from '@/lib/finance'
import { listAllocations, listDailyReturns, custodyBalances, reconcileAllocation } from '@/lib/fieldSales'

export const dynamic = 'force-dynamic'

const num = (n: number) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 3 })
const ksh = (n: number) => `KSh ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  prepared: 'bg-blue-50 text-blue-700',
  issued: 'bg-amber-50 text-amber-700',
  active: 'bg-amber-50 text-amber-700',
  awaiting_returns: 'bg-amber-50 text-amber-700',
  partially_reconciled: 'bg-blue-50 text-blue-700',
  reconciled: 'bg-emerald-50 text-emerald-700',
  closed: 'bg-emerald-50 text-emerald-700',
  variance_under_review: 'bg-red-50 text-red-600',
  cancelled: 'bg-gray-100 text-gray-400',
}

/**
 * FIELD SALES — custody, daily returns and weekly reconciliation.
 *
 * The custody balance is a SECOND ledger, not a copy of the first. The weekly
 * delivery note deducts the main store once; daily sales reduce custody only.
 * Everything on this page reads those two ledgers rather than recomputing from
 * documents, so what is shown is what is recorded.
 */
export default async function FieldSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; allocation?: string }>
}) {
  const actor = await requireSection('inventory')
  const sp = await searchParams
  const allowed = actor.allowedBrandIds('inventory')

  const [allBrands, team, items, allocations, custody, returns] = await Promise.all([
    listBrands(),
    listTeam(),
    listItems(allowed, sp.brand),
    listAllocations(allowed, { brandId: sp.brand, limit: 25 }),
    custodyBalances(allowed),
    listDailyReturns(allowed, { limit: 20 }),
  ])
  const brands = scopeBrands(allBrands, allowed)
  const memberById = new Map(team.map((m) => [m.id, m]))
  const itemById = new Map(items.map((i) => [i.id, i]))

  const selectedId = sp.allocation || allocations.find((a) => a.status !== 'closed')?.id || ''
  const reconciliation = selectedId ? await reconcileAllocation(selectedId).catch(() => null) : null

  const heldValue = custody.reduce((s, c) => {
    const item = itemById.get(c.itemId)
    return s + c.balance * Number(item?.selling_price_ksh ?? item?.unit_value_ksh ?? 0)
  }, 0)
  const openAllocations = allocations.filter((a) => !['closed', 'reconciled', 'cancelled'].includes(a.status))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Sales operations</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-gray-900">
            <Truck size={22} className="text-gray-400" /> Field sales
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Stock handed to sales teams, what they sold each day, and what came back. Custody is its
            own ledger — the store is deducted once, at hand-over, never again at the point of sale.
          </p>
        </div>
        <Link href="/forms/operations?pad=delivery"
          className="inline-flex items-center gap-1.5 rounded-lg bg-ocg-navy px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
          New delivery note <ArrowUpRight size={14} />
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Open delivery notes" value={String(openAllocations.length)} />
        <Stat label="Items in custody" value={String(custody.filter((c) => c.balance > 0).length)} />
        <Stat label="Units held" value={num(custody.reduce((s, c) => s + c.balance, 0))} />
        <Stat label="Value in custody" value={ksh(heldValue)} />
      </div>

      {brands.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <Link href="/field-sales" className={`rounded-full border px-3 py-1.5 text-xs font-medium ${!sp.brand ? 'border-ocg-navy bg-ocg-navy text-white' : 'border-gray-200 bg-white text-gray-600'}`}>All brands</Link>
          {brands.map((b) => (
            <Link key={b.id} href={`/field-sales?brand=${b.id}`}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${sp.brand === b.id ? 'border-ocg-navy bg-ocg-navy text-white' : 'border-gray-200 bg-white text-gray-600'}`}>
              {b.short_name || b.name}
            </Link>
          ))}
        </div>
      )}

      {reconciliation && (
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">
              Week reconciliation · {reconciliation.allocation.delivery_note_no || reconciliation.allocation.allocation_ref}
            </h2>
            <span className="text-xs text-gray-400">
              {reconciliation.allocation.week_start} → {reconciliation.allocation.week_end}
              {reconciliation.allocation.salesperson_id && ` · ${memberById.get(reconciliation.allocation.salesperson_id)?.name ?? ''}`}
            </span>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <Stat small label="Cash expected" value={ksh(reconciliation.cash.expected)} />
            <Stat small label="Cash submitted" value={ksh(reconciliation.cash.submitted)} tone="text-emerald-600" />
            <Stat small label="Credit sales" value={ksh(reconciliation.cash.credit)} />
            <Stat small label="Shortfall" value={ksh(reconciliation.cash.shortfall)}
              tone={Math.abs(reconciliation.cash.shortfall) > 0.5 ? 'text-red-600' : 'text-gray-900'} />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-[10px] uppercase tracking-wider text-gray-400">
                  <th className="px-3 py-2 text-left font-semibold">Item</th>
                  <th className="px-3 py-2 text-right font-semibold">Issued</th>
                  <th className="px-3 py-2 text-right font-semibold">Sold</th>
                  <th className="px-3 py-2 text-right font-semibold">Damaged</th>
                  <th className="px-3 py-2 text-right font-semibold">Sampled</th>
                  <th className="px-3 py-2 text-right font-semibold">Returned</th>
                  <th className="px-3 py-2 text-right font-semibold">In custody</th>
                  <th className="px-3 py-2 text-right font-semibold">Unaccounted</th>
                </tr>
              </thead>
              <tbody>
                {reconciliation.lines.map((l) => (
                  <tr key={l.itemId} className="border-b border-gray-50 last:border-0">
                    <td className="px-3 py-2 text-gray-800">{itemById.get(l.itemId)?.name ?? 'Item'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">{num(l.issued)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">{num(l.sold)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">{l.damaged ? num(l.damaged) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">{l.sampled ? num(l.sampled) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">{l.returned ? num(l.returned) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900">{num(l.inCustody)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${Math.abs(l.unaccounted) > 0.001 ? 'text-red-600' : 'text-gray-300'}`}>
                      {Math.abs(l.unaccounted) > 0.001 ? num(l.unaccounted) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {reconciliation.lines.some((l) => Math.abs(l.unaccounted) > 0.001) && (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <TriangleAlert size={15} className="mt-0.5 shrink-0" />
              <span>
                Stock left custody with no explanation — it was issued, but is not sold, damaged,
                sampled, returned or still held. This week cannot close without a manager approving
                the variance with a reason.
              </span>
            </p>
          )}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Delivery notes</h2>
          {allocations.length === 0 ? (
            <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
              No delivery notes yet. Raise one from the operational forms.
            </p>
          ) : (
            <div className="space-y-2">
              {allocations.map((a) => (
                <Link key={a.id} href={`/field-sales?allocation=${a.id}${sp.brand ? `&brand=${sp.brand}` : ''}`}
                  className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    a.id === selectedId ? 'border-ocg-gold/50 bg-amber-50/30' : 'border-gray-100 hover:border-ocg-gold/40'
                  }`}>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-gray-800">
                      {a.delivery_note_no || a.allocation_ref}
                    </span>
                    <span className="block truncate text-xs text-gray-400">
                      {a.week_start} → {a.week_end}
                      {a.salesperson_id && ` · ${memberById.get(a.salesperson_id)?.name ?? ''}`}
                      {a.vehicle_route && ` · ${a.vehicle_route}`}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_TONE[a.status] ?? STATUS_TONE['draft']}`}>
                    {a.status.replace(/_/g, ' ')}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Custody balances</h2>
          {custody.filter((c) => c.balance > 0).length === 0 ? (
            <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">Nothing currently in custody.</p>
          ) : (
            <div className="space-y-1.5">
              {custody.filter((c) => c.balance > 0).slice(0, 15).map((c) => (
                <div key={`${c.salespersonId}:${c.itemId}`} className="flex items-center justify-between gap-2 rounded-lg border border-gray-50 px-2.5 py-1.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate text-gray-800">{itemById.get(c.itemId)?.name ?? 'Item'}</span>
                    <span className="block truncate text-[11px] text-gray-400">
                      {c.salespersonId ? memberById.get(c.salespersonId)?.name ?? 'Unknown' : 'Unassigned'}
                      {' · '}issued {num(c.issued)} · sold {num(c.sold)}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">{num(c.balance)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Recent daily returns</h2>
        {returns.length === 0 ? (
          <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">No daily returns submitted yet.</p>
        ) : (
          <div className="space-y-2">
            {returns.map((r) => {
              const banked = Number(r.cash_received_ksh ?? 0) + Number(r.mobile_money_ksh ?? 0) + Number(r.bank_ksh ?? 0)
              return (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-gray-800">{r.return_ref} · {r.return_date}</span>
                    <span className="block truncate text-xs text-gray-400">
                      {r.salesperson_id ? memberById.get(r.salesperson_id)?.name ?? '' : ''}
                      {r.credit_sales_ksh > 0 && ` · credit ${ksh(Number(r.credit_sales_ksh))}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-emerald-600">{ksh(banked)}</span>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value, tone = 'text-gray-900', small = false }: {
  label: string; value: string; tone?: string; small?: boolean
}) {
  return (
    <div className={`rounded-xl border border-gray-100 bg-white shadow-sm ${small ? 'p-3' : 'p-4'}`}>
      <p className={`${small ? 'text-xl' : 'text-3xl'} font-light tabular-nums ${tone}`}>{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
    </div>
  )
}

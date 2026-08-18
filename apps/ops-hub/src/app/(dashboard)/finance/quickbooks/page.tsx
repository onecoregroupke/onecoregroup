import Link from 'next/link'
import { ArrowLeft, BookOpenCheck, Info } from 'lucide-react'
import { requireSection } from '@/lib/server-auth'
import { listBrands } from '@/lib/brands'
import { scopeBrands } from '@/lib/finance'
import {
  listExpectedEntries, summariseExpected, listAccountMap,
  listImportedTransactions, proposeMatches,
} from '@/lib/quickbooks'
import { todayInEat } from '@/lib/serverClient'

export const dynamic = 'force-dynamic'

const ksh = (n: number) => `KSh ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const EVENT_LABELS: Record<string, string> = {
  sales_invoice: 'Sales invoices',
  sales_payment: 'Customer payments',
  goods_receipt: 'Supplier bills (GRN)',
  petty_cash_expense: 'Petty cash expenses',
  petty_cash_income: 'Petty cash funding',
}

/**
 * QUICKBOOKS RECONCILIATION.
 *
 * This page works with NO QuickBooks export in hand, which is the point. The
 * manual forms already produce the figures that get keyed into QuickBooks, so
 * the system projects its own documents into QuickBooks's shape and shows you
 * the ledger you should expect to see there. When an export arrives, matching
 * is comparing two lists rather than learning a format from scratch.
 */
export default async function QuickBooksPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; from?: string; to?: string }>
}) {
  const actor = await requireSection('finance')
  const sp = await searchParams
  const allowed = actor.allowedBrandIds('finance')
  const today = todayInEat()
  const from = sp.from || `${today.slice(0, 7)}-01`
  const to = sp.to || today

  const [allBrands, expected, accountMap, imported] = await Promise.all([
    listBrands(),
    listExpectedEntries({ allowed, brandId: sp.brand, from, to }),
    listAccountMap(),
    listImportedTransactions(500),
  ])
  const brands = scopeBrands(allBrands, allowed)
  const summary = summariseExpected(expected)
  const candidates = imported.length > 0 ? proposeMatches(expected, imported) : []

  const totals = summary.reduce(
    (acc, s) => ({
      entries: acc.entries + s.entries,
      amount: acc.amount + s.amountKsh,
      tax: acc.tax + s.taxKsh,
      unreconciled: acc.unreconciled + s.unreconciled,
    }),
    { entries: 0, amount: 0, tax: 0, unreconciled: 0 },
  )

  return (
    <div className="space-y-6">
      <div>
        <Link href="/finance" className="mb-2 inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700">
          <ArrowLeft size={13} /> Finance
        </Link>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Finance · Reconciliation</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-gray-900">
          <BookOpenCheck size={22} className="text-gray-400" /> QuickBooks
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          What the books should show for {from} → {to}, derived from the operational documents
          themselves. Compare this against QuickBooks directly, or import an export to match line by line.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Link href="/finance/quickbooks" className={`rounded-full border px-3 py-1.5 text-xs font-medium ${!sp.brand ? 'border-ocg-navy bg-ocg-navy text-white' : 'border-gray-200 bg-white text-gray-600'}`}>All brands</Link>
        {brands.map((b) => (
          <Link key={b.id} href={`/finance/quickbooks?brand=${b.id}`}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${sp.brand === b.id ? 'border-ocg-navy bg-ocg-navy text-white' : 'border-gray-200 bg-white text-gray-600'}`}>
            {b.short_name || b.name}
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Entries expected" value={String(totals.entries)} />
        <Stat label="Total value" value={ksh(totals.amount)} />
        <Stat label="VAT" value={ksh(totals.tax)} />
        <Stat label="Not yet reconciled" value={String(totals.unreconciled)}
          tone={totals.unreconciled ? 'text-amber-600' : 'text-gray-900'} />
      </div>

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Expected in QuickBooks</h2>
        {summary.length === 0 ? (
          <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
            No posted documents in this period, so nothing should have reached QuickBooks yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-[10px] uppercase tracking-wider text-gray-400">
                  <th className="px-3 py-2 text-left font-semibold">Source</th>
                  <th className="px-3 py-2 text-left font-semibold">Debit</th>
                  <th className="px-3 py-2 text-left font-semibold">Credit</th>
                  <th className="px-3 py-2 text-right font-semibold">Entries</th>
                  <th className="px-3 py-2 text-right font-semibold">Value</th>
                  <th className="px-3 py-2 text-right font-semibold">VAT</th>
                  <th className="px-3 py-2 text-right font-semibold">Unreconciled</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => {
                  const map = accountMap.find((m) => m.event_type === s.eventType)
                  return (
                    <tr key={s.eventType} className="border-b border-gray-50 last:border-0">
                      <td className="px-3 py-2 text-gray-800">{EVENT_LABELS[s.eventType] ?? s.eventType}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{map?.debit_account || '—'}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{map?.credit_account || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600">{s.entries}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900">{ksh(s.amountKsh)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-500">{s.taxKsh ? ksh(s.taxKsh) : '—'}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${s.unreconciled ? 'font-semibold text-amber-600' : 'text-gray-300'}`}>
                        {s.unreconciled || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-gray-400">
          Account names are editable defaults, not a real chart of accounts. Confirm them against
          QuickBooks before relying on the debit/credit columns.
        </p>
      </section>

      {imported.length === 0 ? (
        <section className="rounded-xl border border-blue-200 bg-blue-50 p-5">
          <div className="flex items-start gap-2">
            <Info size={16} className="mt-0.5 shrink-0 text-blue-600" />
            <div className="text-sm text-blue-900">
              <p className="font-semibold">No QuickBooks export has been imported yet.</p>
              <p className="mt-1 leading-relaxed">
                Nothing is blocked by that. The table above is built from documents already recorded
                here, so it can be checked against QuickBooks by eye today. When an export is
                uploaded, the system will match it against these entries automatically — and a match
                will never be accepted on amount alone, which is enforced by a database constraint,
                not just by convention.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Suggested matches</h2>
            <span className="text-xs text-gray-400">{imported.length} imported line(s)</span>
          </div>
          {candidates.length === 0 ? (
            <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
              No candidate agrees on two or more signals, so nothing is suggested. Amount alone is
              never sufficient.
            </p>
          ) : (
            <div className="space-y-2">
              {candidates.slice(0, 25).map((c, i) => (
                <div key={`${c.expected.entity_id}-${c.qb.id}-${i}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate text-gray-800">
                      {c.expected.doc_number} · {c.expected.party_name || '—'}
                      <span className="text-gray-400"> ↔ </span>
                      {c.qb.qb_doc_number || c.qb.reference || '—'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {c.expected.entry_date} · matched on {c.basis.join(', ')}
                      {Math.abs(c.differenceKsh) > 0.005 && ` · differs by ${ksh(Math.abs(c.differenceKsh))}`}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold ${
                    c.confidence >= 70 ? 'bg-emerald-50 text-emerald-700'
                      : c.confidence >= 45 ? 'bg-amber-50 text-amber-700'
                        : 'bg-gray-100 text-gray-500'
                  }`}>{c.confidence}% · {c.basis.length} signals</span>
                </div>
              ))}
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

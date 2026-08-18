import Link from 'next/link'
import { Wallet, ArrowUpRight } from 'lucide-react'
import { requireSection } from '@/lib/server-auth'
import { listBrands } from '@/lib/brands'
import { listTeam } from '@/lib/team'
import { scopeBrands } from '@/lib/finance'
import { listFloats, floatBalance } from '@/lib/pettyCashFloats'
import { FloatPanel, type FloatSummary } from '@/components/finance/FloatPanel'

export const dynamic = 'force-dynamic'

const ksh = (n: number) => `KSh ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

/**
 * PETTY CASH — the float cycle.
 *
 * A float is opened with cash, spent against, closed against a physical count,
 * and its remainder carried, returned, reimbursed or written off. The two
 * guarantees enforced beneath this page are that a custodian holds only one
 * open float at a time, and that a float has at most one successor — so a
 * carried balance can never also be reimbursed.
 */
export default async function PettyCashPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>
}) {
  const actor = await requireSection('finance')
  const sp = await searchParams
  const allowed = actor.allowedBrandIds('finance')

  const [allBrands, team, floats] = await Promise.all([
    listBrands(),
    listTeam(),
    listFloats(allowed, { brandId: sp.brand, limit: 40 }),
  ])
  const brands = scopeBrands(allBrands, allowed)

  // Each float's live balance is replayed from its transactions, not stored.
  const summaries: FloatSummary[] = await Promise.all(
    floats.map(async (f) => {
      const { calculated } = await floatBalance(f.id).catch(() => ({ calculated: 0 }))
      return {
        id: f.id,
        ref: f.float_ref,
        custodian: f.custodian,
        status: f.status,
        openedOn: f.opened_on,
        totalAvailable: Number(f.total_available_ksh ?? 0),
        calculated,
        carryDecision: f.carry_forward_decision ?? '',
        hasSuccessor: !!f.succeeding_float_id,
      }
    }),
  )

  const live = summaries.filter((f) => !['closed', 'reconciled', 'cancelled'].includes(f.status))
  const outstanding = live.reduce((s, f) => s + f.calculated, 0)
  const issued = live.reduce((s, f) => s + f.totalAvailable, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Finance</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-gray-900">
            <Wallet size={22} className="text-gray-400" /> Petty cash
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Float cycles: opened with cash, spent against, closed against a physical count. Every
            balance shown is replayed from the transactions charged to that float, never typed.
          </p>
        </div>
        <Link href="/finance"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:border-ocg-gold/40">
          Finance <ArrowUpRight size={14} />
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Open floats" value={String(live.length)} />
        <Stat label="Cash issued" value={ksh(issued)} />
        <Stat label="Balance held" value={ksh(outstanding)} tone="text-emerald-600" />
      </div>

      {brands.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <Link href="/petty-cash" className={`rounded-full border px-3 py-1.5 text-xs font-medium ${!sp.brand ? 'border-ocg-navy bg-ocg-navy text-white' : 'border-gray-200 bg-white text-gray-600'}`}>All brands</Link>
          {brands.map((b) => (
            <Link key={b.id} href={`/petty-cash?brand=${b.id}`}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${sp.brand === b.id ? 'border-ocg-navy bg-ocg-navy text-white' : 'border-gray-200 bg-white text-gray-600'}`}>
              {b.short_name || b.name}
            </Link>
          ))}
        </div>
      )}

      <FloatPanel
        brands={brands.map((b) => ({ id: b.id, label: b.name }))}
        custodians={team.map((m) => ({ id: m.id, label: m.name }))}
        defaultBrandId={brands[0]?.id ?? ''}
        floats={summaries}
      />

      <p className="rounded-xl border border-gray-100 bg-white p-4 text-xs leading-relaxed text-gray-500 shadow-sm">
        <strong className="text-gray-700">Charges are kept separate from expenses.</strong> The sheets
        record a transaction charge apart from the amount spent, and the system keeps them apart too.
        They are only combined at the point of comparing against a bank or QuickBooks line, which is
        what actually left the account.
      </p>
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

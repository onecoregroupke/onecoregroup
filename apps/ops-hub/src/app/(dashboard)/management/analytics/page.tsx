import Link from 'next/link'
import { BarChart3, ArrowUpRight } from 'lucide-react'
import { requireSection } from '@/lib/server-auth'
import { listBrands } from '@/lib/brands'
import { getManagementAnalytics } from '@/lib/analytics'
import { formatKsh } from '@/lib/money'
import { todayInEat } from '@/lib/serverClient'
import { AnalyticsExport } from '@/components/management/AnalyticsExport'

export const dynamic = 'force-dynamic'

const PERIODS = [
  { value: 'all', label: 'All time' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'This month' },
  { value: 'quarter', label: 'This quarter' },
  { value: 'year', label: 'This year' },
]

function periodRange(p: string, today: string): { from: string; to: string } {
  if (p === 'week') { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 6); return { from: d.toISOString().slice(0, 10), to: today } }
  if (p === 'month') return { from: `${today.slice(0, 7)}-01`, to: today }
  if (p === 'quarter') { const m = Math.floor(Number(today.slice(5, 7)) / 3) * 3 + 1; return { from: `${today.slice(0, 4)}-${String(m).padStart(2, '0')}-01`, to: today } }
  if (p === 'year') return { from: `${today.slice(0, 4)}-01-01`, to: today }
  return { from: '', to: '' }
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireSection('management')
  const sp = await searchParams
  const period = sp.period ?? 'all'
  const brandSlug = sp.brand
  const today = todayInEat()
  const { from, to } = periodRange(period, today)
  const allowed = actor.permissions === null || actor.isSuperAdmin ? null : (actor.allowedBrandIds('finance') ?? actor.allowedBrandIds('management') ?? [])

  const [brands, a] = await Promise.all([listBrands(), getManagementAnalytics(allowed, { brandSlug, from, to })])
  const visibleBrands = allowed === null ? brands : brands.filter((b) => allowed.includes(b.id))
  const maxMonth = Math.max(1, ...a.byMonth.map((m) => m.income + m.feesPaid))

  const exportSheets = {
    'By brand': a.byBrand.map((b) => ({ Brand: b.brandName, Income: b.income, 'Fees paid': b.feesPaid, Expense: b.expense, 'Fees outstanding': b.feesOutstanding, Net: b.net })),
    'By month': a.byMonth.map((m) => ({ Month: m.ym, Income: m.income, 'Fees paid': m.feesPaid, Expense: m.expense })),
    'School fees': a.schools.map((s) => ({ School: s.brandName, Students: s.students, Charged: s.charged, Paid: s.paid, Outstanding: s.outstanding, 'Collection %': s.collectionRate })),
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Management</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-gray-900"><BarChart3 size={22} /> Analytics &amp; reports</h1>
          <p className="mt-1 text-sm text-gray-500">{a.scopeLabel} · income, school fees, and operations. Fees are folded into income + the monthly trend.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/management/analytics/operations"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:border-ocg-gold/40 print:hidden">
            Operational analytics <ArrowUpRight size={14} />
          </Link>
          <AnalyticsExport sheets={exportSheets} filename={`ocg-analytics-${brandSlug ?? 'all'}-${period}`} />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 print:hidden">
        <Chip href={hrefWith(sp, { brand: undefined })} active={!brandSlug}>All brands</Chip>
        {visibleBrands.map((b) => <Chip key={b.id} href={hrefWith(sp, { brand: b.slug })} active={brandSlug === b.slug}>{b.short_name || b.name}</Chip>)}
        <span className="mx-1 w-px bg-gray-200" />
        {PERIODS.map((p) => <Chip key={p.value} href={hrefWith(sp, { period: p.value })} active={period === p.value}>{p.label}</Chip>)}
      </div>

      {/* Totals */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Tile label="Income (incl. fees)" value={formatKsh(a.totals.income + a.totals.feesPaid)} tone="text-emerald-600" />
        <Tile label="Expense" value={formatKsh(a.totals.expense)} tone="text-red-600" />
        <Tile label="Net" value={formatKsh(a.totals.net)} tone={a.totals.net >= 0 ? 'text-gray-900' : 'text-red-600'} />
        <Tile label="Fees outstanding" value={formatKsh(a.totals.feesOutstanding)} tone="text-amber-600" />
        <Tile label="Fee collection" value={`${a.totals.collectionRate}%`} tone="text-gray-900" />
      </div>

      {/* Monthly trend */}
      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Monthly trend (income + fees vs expense)</h2>
        {a.byMonth.length === 0 ? <Empty>No financial activity in this range yet.</Empty> : (
          <div className="space-y-1.5">
            {a.byMonth.slice(-18).map((m) => {
              const inc = m.income + m.feesPaid
              return (
                <div key={m.ym} className="flex items-center gap-3 text-xs">
                  <span className="w-16 shrink-0 text-gray-500">{m.ym}</span>
                  <div className="flex h-4 flex-1 overflow-hidden rounded bg-gray-50">
                    <div className="bg-emerald-400" style={{ width: `${(inc / maxMonth) * 100}%` }} title={`In ${formatKsh(inc)}`} />
                    <div className="bg-red-300" style={{ width: `${(m.expense / maxMonth) * 100}%` }} title={`Out ${formatKsh(m.expense)}`} />
                  </div>
                  <span className="w-28 shrink-0 text-right text-gray-600">{formatKsh(inc)}</span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* By brand */}
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">By brand</h2>
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400"><th className="px-3 py-2">Brand</th><th className="px-3 py-2 text-right">Income</th><th className="px-3 py-2 text-right">Fees paid</th><th className="px-3 py-2 text-right">Expense</th><th className="px-3 py-2 text-right">Net</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {a.byBrand.map((b) => (
                  <tr key={b.brandId}><td className="px-3 py-2 font-medium text-gray-800">{b.brandName}</td><td className="px-3 py-2 text-right text-emerald-700">{formatKsh(b.income)}</td><td className="px-3 py-2 text-right text-emerald-700">{formatKsh(b.feesPaid)}</td><td className="px-3 py-2 text-right text-red-700">{formatKsh(b.expense)}</td><td className={`px-3 py-2 text-right font-medium ${b.net >= 0 ? 'text-gray-900' : 'text-red-600'}`}>{formatKsh(b.net)}</td></tr>
                ))}
                {a.byBrand.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-400">No brand activity in range.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        {/* School fees */}
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">School fee collection</h2>
          {a.schools.length === 0 ? <Empty>No school in this scope.</Empty> : (
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full min-w-[520px] text-sm">
                <thead><tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400"><th className="px-3 py-2">School</th><th className="px-3 py-2 text-right">Students</th><th className="px-3 py-2 text-right">Charged</th><th className="px-3 py-2 text-right">Paid</th><th className="px-3 py-2 text-right">Outstanding</th><th className="px-3 py-2 text-right">Collected</th></tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {a.schools.map((s) => (
                    <tr key={s.school}><td className="px-3 py-2 font-medium text-gray-800">{s.brandName}</td><td className="px-3 py-2 text-right text-gray-600">{s.students}</td><td className="px-3 py-2 text-right text-gray-600">{formatKsh(s.charged)}</td><td className="px-3 py-2 text-right text-emerald-700">{formatKsh(s.paid)}</td><td className="px-3 py-2 text-right text-amber-700">{formatKsh(s.outstanding)}</td><td className="px-3 py-2 text-right font-medium text-gray-900">{s.collectionRate}%</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-gray-400">Fees are read live from the canonical imported ledger.</p>
        </section>
      </div>

      {/* Task health */}
      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Task health</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <Tile label="Total tasks" value={String(a.tasks.total)} />
          <Tile label="Completed" value={String(a.tasks.completed)} tone="text-emerald-600" />
          <Tile label="Open" value={String(a.tasks.open)} />
          <Tile label="Overdue" value={String(a.tasks.overdue)} tone={a.tasks.overdue ? 'text-red-600' : 'text-gray-900'} />
        </div>
      </section>
    </div>
  )
}

function hrefWith(sp: Record<string, string | undefined>, patch: Record<string, string | undefined>): string {
  const p = new URLSearchParams()
  const merged = { ...sp, ...patch }
  for (const k of ['brand', 'period'] as const) { const v = merged[k]; if (v) p.set(k, v) }
  const qs = p.toString()
  return qs ? `/management/analytics?${qs}` : '/management/analytics'
}
function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return <Link href={href} className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${active ? 'border-ocg-navy bg-ocg-navy text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-ocg-gold/50'}`}>{children}</Link>
}
function Tile({ label, value, tone = 'text-gray-900' }: { label: string; value: string; tone?: string }) {
  return <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"><p className={`text-2xl font-light ${tone}`}>{value}</p><p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p></div>
}
function Empty({ children }: { children: React.ReactNode }) { return <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">{children}</p> }

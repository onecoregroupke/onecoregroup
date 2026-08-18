import Link from 'next/link'
import { ArrowLeft, Factory, Boxes, ListTodo, CalendarCheck, ClipboardCheck, TriangleAlert } from 'lucide-react'
import { requireSection } from '@/lib/server-auth'
import { memberForEmail } from '@/lib/team'
import { listBrands } from '@/lib/brands'
import { scopeBrands } from '@/lib/finance'
import { dutyScope } from '@/lib/dutyModel'
import {
  manufacturingAnalytics, inventoryAnalytics, taskAnalytics, dutyAnalytics, attendanceAnalytics,
} from '@/lib/opsAnalytics'
import { todayInEat } from '@/lib/serverClient'

export const dynamic = 'force-dynamic'

const num = (n: number) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })
const ksh = (n: number) => `KSh ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

const PERIODS = [
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'This month' },
  { value: 'quarter', label: 'This quarter' },
  { value: 'year', label: 'This year' },
]

function periodRange(p: string, today: string): { from: string; to: string } {
  if (p === 'week') {
    const d = new Date(`${today}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - 6)
    return { from: d.toISOString().slice(0, 10), to: today }
  }
  if (p === 'quarter') {
    const m = Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1
    return { from: `${today.slice(0, 4)}-${String(m).padStart(2, '0')}-01`, to: today }
  }
  if (p === 'year') return { from: `${today.slice(0, 4)}-01-01`, to: today }
  return { from: `${today.slice(0, 7)}-01`, to: today }
}

/**
 * OPERATIONAL ANALYTICS — manufacturing, inventory, tasks, duties, attendance.
 *
 * Every number is computed from an operational table. Where a metric has no
 * data it shows zero and says why; nothing here is a placeholder or a seeded
 * figure. Metrics that cannot yet be computed honestly — SKU and salesperson
 * performance, which need the sales order book — are named as missing rather
 * than faked.
 */
export default async function OperationsAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; brand?: string }>
}) {
  const actor = await requireSection('management')
  const sp = await searchParams
  const period = sp.period ?? 'month'
  const today = todayInEat()
  const win = periodRange(period, today)

  const allowed = actor.allowedBrandIds('inventory') ?? actor.allowedBrandIds('management')
  const me = await memberForEmail(actor.email)
  const scope = dutyScope({ permissions: actor.permissions, brandAccess: actor.brandAccess, teamMemberId: me?.id ?? null })

  const [allBrands, mfg, inv, tasks, duties, attendance] = await Promise.all([
    listBrands(),
    manufacturingAnalytics(allowed, win, sp.brand),
    inventoryAnalytics(allowed, win, sp.brand),
    taskAnalytics(allowed, win, sp.brand, today),
    dutyAnalytics(scope, win),
    attendanceAnalytics(win),
  ])
  const brands = scopeBrands(allBrands, allowed)

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const merged = { period, brand: sp.brand, ...patch }
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v)
    return `?${p.toString()}`
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/management/analytics" className="mb-2 inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700">
          <ArrowLeft size={13} /> Financial analytics
        </Link>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Management · Operations</p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">Operational analytics</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          Manufacturing, inventory, tasks, duties and attendance for {win.from} → {win.to}.
          Every figure is computed from the operational records themselves.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
          {PERIODS.map((p) => (
            <Link key={p.value} href={qs({ period: p.value })}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                period === p.value ? 'bg-ocg-navy text-white' : 'text-gray-500 hover:text-gray-900'
              }`}>{p.label}</Link>
          ))}
        </div>
        {brands.length > 1 && (
          <div className="flex flex-wrap gap-1">
            <Link href={qs({ brand: undefined })}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                !sp.brand ? 'border-ocg-navy bg-ocg-navy text-white' : 'border-gray-200 bg-white text-gray-600'
              }`}>All brands</Link>
            {brands.map((b) => (
              <Link key={b.id} href={qs({ brand: b.id })}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  sp.brand === b.id ? 'border-ocg-navy bg-ocg-navy text-white' : 'border-gray-200 bg-white text-gray-600'
                }`}>{b.short_name || b.name}</Link>
            ))}
          </div>
        )}
      </div>

      {/* ── Manufacturing ───────────────────────────────────────────── */}
      <Section icon={Factory} title="Manufacturing">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Runs in period" value={num(mfg.runs)} hint={`${mfg.activeRuns} still open`} />
          <Stat label="Produced" value={num(mfg.producedQuantity)} tone="text-emerald-600" />
          <Stat label="Rejected" value={num(mfg.rejectedQuantity)} tone={mfg.rejectedQuantity ? 'text-red-600' : 'text-gray-900'}
            hint={`${mfg.rejectRatePct}% reject rate`} />
          <Stat label="Plan attainment" value={`${mfg.planAttainmentPct}%`}
            tone={mfg.planAttainmentPct >= 95 ? 'text-emerald-600' : mfg.planAttainmentPct > 0 ? 'text-amber-600' : 'text-gray-900'}
            hint={`planned ${num(mfg.plannedQuantity)}`} />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Stat label="Raw material consumed" value={num(mfg.rawConsumed)} small />
          <Stat label="Packaging consumed" value={num(mfg.packagingConsumed)} small />
        </div>

        {mfg.byProduct.length > 0 && (
          <Table
            className="mt-4"
            head={['Product', 'Produced', 'Rejected', 'Reject rate']}
            rows={mfg.byProduct.map((p) => [
              p.name,
              num(p.produced),
              num(p.rejected),
              <span key="r" className={p.rejectRatePct > 5 ? 'font-semibold text-red-600' : 'text-gray-600'}>{p.rejectRatePct}%</span>,
            ])}
          />
        )}

        {mfg.bottlenecks.length > 0 && (
          <>
            <h3 className="mt-4 mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Bottlenecks · runs open longest
            </h3>
            <Table
              head={['Run', 'Product', 'Status', 'Age']}
              rows={mfg.bottlenecks.map((b) => [
                b.runRef, b.product || '—', b.status.replace(/_/g, ' '),
                <span key="a" className={b.ageDays > 7 ? 'font-semibold text-amber-600' : 'text-gray-600'}>{b.ageDays}d</span>,
              ])}
            />
          </>
        )}

        {mfg.runs === 0 && (
          <Empty>No production runs in this period.</Empty>
        )}
      </Section>

      {/* ── Inventory ───────────────────────────────────────────────── */}
      <Section icon={Boxes} title="Inventory">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Stock valuation" value={ksh(inv.totalValueKsh)} />
          <Stat label="Movements in" value={`+${num(inv.totalIn)}`} tone="text-emerald-600" />
          <Stat label="Movements out" value={`−${num(inv.totalOut)}`} tone="text-red-600" />
          <Stat label="Stock-outs" value={num(inv.stockOuts.length)} tone={inv.stockOuts.length ? 'text-red-600' : 'text-gray-900'} />
        </div>

        {inv.ledgerDrift.length > 0 && (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <TriangleAlert size={15} className="mt-0.5 shrink-0" />
            <span>
              <strong>{inv.ledgerDrift.length}</strong> item{inv.ledgerDrift.length === 1 ? '' : 's'} where the
              replayed ledger closing does not match the recorded quantity — a change was made outside
              the ledger. <Link href="/inventory/stock-cards" className="underline">Open the stock card</Link>.
            </span>
          </p>
        )}

        {inv.valueByType.length > 0 && (
          <Table
            className="mt-4"
            head={['Item type', 'Items', 'Value']}
            rows={inv.valueByType.map((t) => [
              <span key="t" className="capitalize">{t.itemType.replace(/_/g, ' ')}</span>,
              num(t.items), ksh(t.valueKsh),
            ])}
          />
        )}

        {inv.belowReorder.length > 0 && (
          <>
            <h3 className="mt-4 mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              At or below reorder level
            </h3>
            <Table
              head={['Item', 'On hand', 'Threshold']}
              rows={inv.belowReorder.slice(0, 12).map((i) => [
                i.name,
                <span key="o" className="font-semibold text-amber-600">{num(i.onHand)} {i.unit}</span>,
                `${num(i.threshold)} ${i.unit}`,
              ])}
            />
          </>
        )}

        {inv.slowMoving.length > 0 && (
          <>
            <h3 className="mt-4 mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Slow-moving · stock held with no movement this period
            </h3>
            <Table
              head={['Item', 'On hand', 'Value', 'Last movement']}
              rows={inv.slowMoving.slice(0, 10).map((i) => [
                i.name, num(i.onHand), ksh(i.valueKsh), i.lastMovement ?? 'never',
              ])}
            />
          </>
        )}
      </Section>

      {/* ── Tasks ───────────────────────────────────────────────────── */}
      <Section icon={ListTodo} title="Tasks">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Tasks in period" value={num(tasks.total)} />
          <Stat label="Completion rate" value={`${tasks.completionRatePct}%`}
            tone={tasks.completionRatePct >= 80 ? 'text-emerald-600' : 'text-amber-600'}
            hint={`${tasks.completed} completed`} />
          <Stat label="Overdue" value={num(tasks.overdue)} tone={tasks.overdue ? 'text-red-600' : 'text-gray-900'} />
          <Stat label="Awaiting review" value={num(tasks.awaitingReview)} tone={tasks.awaitingReview ? 'text-amber-600' : 'text-gray-900'} />
        </div>
        {tasks.byPerson.length > 0 ? (
          <Table
            className="mt-4"
            head={['Person', 'Assigned', 'Completed', 'Overdue', 'Rate']}
            rows={tasks.byPerson.slice(0, 15).map((p) => [
              p.name, num(p.total), num(p.completed),
              <span key="o" className={p.overdue ? 'font-semibold text-red-600' : 'text-gray-400'}>{p.overdue || '—'}</span>,
              <span key="r" className={p.completionRatePct >= 80 ? 'text-emerald-600' : 'text-amber-600'}>{p.completionRatePct}%</span>,
            ])}
          />
        ) : <Empty>No tasks with a target date in this period.</Empty>}
      </Section>

      {/* ── Duties ──────────────────────────────────────────────────── */}
      <Section icon={CalendarCheck} title="Recurring duties">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Occurrences" value={num(duties.occurrences)} hint="derived, not stored" />
          <Stat label="Completion rate" value={`${duties.completionRatePct}%`}
            tone={duties.completionRatePct >= 80 ? 'text-emerald-600' : 'text-amber-600'} />
          <Stat label="On-time rate" value={`${duties.onTimeRatePct}%`}
            tone={duties.onTimeRatePct >= 80 ? 'text-emerald-600' : 'text-amber-600'} />
          <Stat label="Overdue" value={num(duties.overdue)} tone={duties.overdue ? 'text-red-600' : 'text-gray-900'} />
        </div>
        {duties.byPerson.length > 0 ? (
          <Table
            className="mt-4"
            head={['Person', 'Occurrences', 'Done', 'Rate']}
            rows={duties.byPerson.slice(0, 15).map((p) => [
              p.name, num(p.total), num(p.done),
              <span key="r" className={p.completionRatePct >= 80 ? 'text-emerald-600' : 'text-amber-600'}>{p.completionRatePct}%</span>,
            ])}
          />
        ) : <Empty>No duty occurrences fell in this period.</Empty>}
      </Section>

      {/* ── Attendance ──────────────────────────────────────────────── */}
      <Section icon={ClipboardCheck} title="Attendance">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Records" value={num(attendance.records)} hint={`${attendance.daysCovered} days covered`} />
          <Stat label="People" value={num(attendance.people)} />
          <Stat label="Average hours" value={attendance.averageHours == null ? '—' : `${attendance.averageHours}h`}
            hint={attendance.averageHours == null ? 'no complete in/out pairs' : undefined} />
          <Stat label="Missing check-out" value={num(attendance.missingCheckOut)}
            tone={attendance.missingCheckOut ? 'text-amber-600' : 'text-gray-900'} />
        </div>
        {attendance.byPerson.length > 0 ? (
          <Table
            className="mt-4"
            head={['Person', 'Days', 'Avg hours', 'Missing check-out']}
            rows={attendance.byPerson.slice(0, 15).map((p) => [
              p.name, num(p.days), p.averageHours == null ? '—' : `${p.averageHours}h`,
              <span key="m" className={p.missingCheckOut ? 'text-amber-600' : 'text-gray-400'}>{p.missingCheckOut || '—'}</span>,
            ])}
          />
        ) : <Empty>No attendance records imported for this period.</Empty>}
      </Section>

      <p className="rounded-xl border border-gray-100 bg-white p-4 text-xs leading-relaxed text-gray-500 shadow-sm">
        <strong className="text-gray-700">Not shown, and why.</strong> SKU performance, salesperson
        performance and territory performance need a customer sales order book, which does not exist
        in the schema yet — see <code className="rounded bg-gray-100 px-1">docs/iceland-erp/01-MAPPING-REPORT.md</code> §8.
        Field-sales and petty-cash analytics are omitted for the same reason: the tables exist but
        hold no data until those workflows are used. Showing a zero there would look like a measured
        result rather than an absent one.
      </p>
    </div>
  )
}

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Icon size={15} className="text-gray-400" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function Stat({ label, value, tone = 'text-gray-900', hint, small = false }: {
  label: string; value: string; tone?: string; hint?: string; small?: boolean
}) {
  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <p className={`${small ? 'text-xl' : 'text-2xl'} font-light tabular-nums ${tone}`}>{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] text-gray-400">{hint}</p>}
    </div>
  )
}

function Table({ head, rows, className = '' }: { head: string[]; rows: React.ReactNode[][]; className?: string }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400">
            {head.map((h, i) => (
              <th key={h} className={`px-3 py-2 font-semibold ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-gray-50 last:border-0">
              {row.map((cell, ci) => (
                <td key={ci} className={`px-3 py-2 ${ci === 0 ? 'text-left text-gray-800' : 'text-right tabular-nums text-gray-600'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">{children}</p>
}

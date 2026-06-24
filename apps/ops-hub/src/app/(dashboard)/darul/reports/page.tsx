import { getDarulAdminData } from '@/lib/management'

export const dynamic = 'force-dynamic'

export default async function DarulReportsPage() {
  const { students, classes, admissions, hifz, invoices, feeFollowups, adminTasks } = await getDarulAdminData()

  const byStatus = countBy(students.map((s) => s.enrollment_status || 'unknown'))
  const byPipeline = countBy(admissions.map((a) => a.pipeline_status || 'unknown'))
  const expected = invoices.reduce((s, i) => s + Number(i.amount_expected_ksh ?? 0), 0)
  const collected = invoices.reduce((s, i) => s + Number(i.amount_paid_ksh ?? 0), 0)
  const outstanding = invoices.reduce((s, i) => s + Number(i.balance_ksh ?? 0), 0)
  const collectionRate = expected > 0 ? Math.round((collected / expected) * 100) : 0
  const memorized = hifz.filter((h) => h.status === 'memorized').length
  const avgJuz = students.length ? (students.reduce((s, x) => s + Number(x.hifz_juz_completed ?? 0), 0) / students.length) : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Darul Swafa reports</h1>
        <p className="text-sm text-gray-500">A snapshot of enrolment, hifz progress, fees, and admin load.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Students" value={students.length} />
        <Stat label="Halaqas" value={classes.length} />
        <Stat label="Avg juz / student" value={Number(avgJuz.toFixed(1))} />
        <Stat label="Fee collection" value={`${collectionRate}%`} tone="text-emerald-600" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Enrolment by status">
          <Breakdown rows={byStatus} />
        </Panel>
        <Panel title="Admissions pipeline">
          <Breakdown rows={byPipeline} />
        </Panel>
        <Panel title="Fees (KSh)">
          <Row label="Expected" value={`KSh ${expected.toLocaleString()}`} />
          <Row label="Collected" value={`KSh ${collected.toLocaleString()}`} />
          <Row label="Outstanding" value={`KSh ${outstanding.toLocaleString()}`} />
          <Row label="Open fee follow-ups" value={feeFollowups.filter((f) => f.follow_up_status !== 'resolved').length} />
        </Panel>
        <Panel title="Hifz & admin">
          <Row label="Hifz milestones logged" value={hifz.length} />
          <Row label="Memorized milestones" value={memorized} />
          <Row label="Open admin tasks" value={adminTasks.filter((t) => t.status !== 'done').length} />
        </Panel>
      </div>
    </div>
  )
}

function countBy(values: string[]): { label: string; value: number }[] {
  const map = new Map<string, number>()
  for (const v of values) map.set(v, (map.get(v) ?? 0) + 1)
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  )
}
function Breakdown({ rows }: { rows: { label: string; value: number }[] }) {
  if (rows.length === 0) return <p className="text-sm text-gray-400">No data yet.</p>
  return <>{rows.map((r) => <Row key={r.label} label={r.label} value={r.value} />)}</>
}
function Row({ label, value }: { label: string; value: number | string }) {
  return <div className="flex items-center justify-between border-b border-gray-50 py-1.5 text-sm last:border-0"><span className="capitalize text-gray-600">{label}</span><span className="font-medium text-gray-900">{value}</span></div>
}
function Stat({ label, value, tone = 'text-gray-900' }: { label: string; value: number | string; tone?: string }) {
  return <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"><p className={`text-3xl font-light ${tone}`}>{value}</p><p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p></div>
}

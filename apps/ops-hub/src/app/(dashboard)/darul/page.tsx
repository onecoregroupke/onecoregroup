import Link from 'next/link'
import { DarulActionPanel } from '@/components/darul/DarulActionPanel'
import { getDarulAdminData } from '@/lib/management'

export const dynamic = 'force-dynamic'

const LINKS = [
  ['Students', '/darul/students'],
  ['Parents', '/darul/parents'],
  ['Admissions', '/darul/admissions'],
  ['Halaqas', '/darul/classes'],
  ['Hifz progress', '/darul/hifz'],
  ['Fees', '/darul/fees'],
  ['Admin tasks', '/darul/admin-tasks'],
  ['Reports', '/darul/reports'],
] as const

export default async function DarulAdminPage() {
  const { students, guardians, classes, admissions, hifz, invoices, feeFollowups, adminTasks, team } = await getDarulAdminData()

  const enrolled = students.filter((s) => s.enrollment_status === 'enrolled' || s.enrollment_status === 'active')
  const openFees = feeFollowups.filter((f) => f.follow_up_status !== 'resolved')
  const outstanding = invoices.reduce((sum, i) => sum + Number(i.balance_ksh ?? 0), 0)
  const expected = invoices.reduce((sum, i) => sum + Number(i.amount_expected_ksh ?? 0), 0)
  const collected = invoices.reduce((sum, i) => sum + Number(i.amount_paid_ksh ?? 0), 0)
  const pendingAdmissions = admissions.filter((a) => !['Enrolled', 'Lost / inactive'].includes(a.pipeline_status))
  const memorized = hifz.filter((h) => h.status === 'memorized').length

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Darul Swafa Madrassa</p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">Darul Swafa Admin Layer</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-500">
          Students, halaqas, hifz (Qur&apos;an memorization) progress, admissions, and manual fee tracking.
          Fees are collected directly via M-Pesa / cash / bank and recorded against invoices here.
        </p>
      </div>

      <DarulActionPanel
        guardians={guardians.map((g) => ({ id: g.id, label: g.full_name }))}
        students={students.map((s) => ({ id: s.id, label: s.full_name }))}
        classes={classes.map((c) => ({ id: c.id, label: c.name }))}
        invoices={invoices.map((i) => ({
          id: i.id,
          label: `${students.find((s) => s.id === i.student_id)?.full_name ?? 'Student'} — ${i.fee_item} (bal KSh ${Number(i.balance_ksh ?? 0).toLocaleString()})`,
        }))}
        team={team.map((m) => ({ id: m.id, label: m.name }))}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Students" value={students.length} />
        <Stat label="Enrolled" value={enrolled.length} />
        <Stat label="Fee follow-ups" value={openFees.length} tone="text-amber-600" />
        <Stat label="Outstanding" value={outstanding} money tone="text-amber-600" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Admin modules</h2>
          <div className="grid gap-2">
            {LINKS.map(([label, href]) => <Link key={href} href={href} className="rounded-lg border border-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:border-ocg-gold/50 hover:text-ocg-gold">{label}</Link>)}
          </div>
        </section>

        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Madrassa status</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Mini label="Admissions in pipeline" value={pendingAdmissions.length} />
            <Mini label="Open admin tasks" value={adminTasks.filter((t) => t.status !== 'done').length} />
            <Mini label="Juz milestones logged" value={hifz.length} />
            <Mini label="Memorized milestones" value={memorized} />
            <Mini label="Fees expected" value={expected} money />
            <Mini label="Fees collected" value={collected} money tone="text-emerald-600" />
          </div>
          <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
            Fees are collected directly (M-Pesa / cash / bank). Record each payment against its invoice;
            balances and follow-ups update automatically.
          </p>
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value, money = false, tone = 'text-gray-900' }: { label: string; value: number; money?: boolean; tone?: string }) {
  return <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"><p className={`text-3xl font-light ${tone}`}>{money ? `KSh ${value.toLocaleString()}` : value}</p><p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p></div>
}
function Mini({ label, value, money = false, tone = 'text-gray-900' }: { label: string; value: number; money?: boolean; tone?: string }) {
  return <div className="rounded-lg bg-gray-50 p-4"><p className={`text-2xl font-light ${tone}`}>{money ? `KSh ${value.toLocaleString()}` : value}</p><p className="text-xs text-gray-400">{label}</p></div>
}

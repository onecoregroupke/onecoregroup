import Link from 'next/link'
import { RayyanActionPanel } from '@/components/rayyan/RayyanActionPanel'
import { getRayyanAdminData } from '@/lib/management'

export const dynamic = 'force-dynamic'

const LINKS = [
  ['Students', '/rayyan/students'],
  ['Parents', '/rayyan/parents'],
  ['Admissions', '/rayyan/admissions'],
  ['Classes', '/rayyan/classes'],
  ['Admin tasks', '/rayyan/admin-tasks'],
  ['Fee follow-ups', '/rayyan/fee-follow-ups'],
  ['Fees (finance)', '/finance/ar-rayyan-playhouse'],
  ['Reports', '/rayyan/reports'],
  ['Daily report books & forms', '/forms?brand=ar-rayyan-playhouse'],
] as const

export default async function RayyanAdminPage() {
  const { students, guardians, admissions, feeFollowups, invoices, adminTasks, snapshots, team } = await getRayyanAdminData()
  const enrolled = students.filter((s) => s.enrollment_status === 'enrolled')
  const pendingAdmissions = admissions.filter((a) => !['Enrolled', 'Lost / inactive'].includes(a.pipeline_status))
  const openFees = feeFollowups.filter((f) => f.follow_up_status !== 'resolved')

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Ar Rayyan Nursery & Daycare</p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">Rayyan Admin Layer</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-500">
          Admissions, parent follow-up, admin tasks, classes, and student fees. Fees are recorded from
          validated Excel imports (the canonical source) and appear in the brand finance workspace.
        </p>
      </div>

      <RayyanActionPanel
        guardians={guardians.map((guardian) => ({ id: guardian.id, label: guardian.full_name }))}
        students={students.map((student) => ({ id: student.id, label: student.full_name }))}
        invoices={invoices.map((invoice) => ({
          id: invoice.id,
          label: `${invoice.fee_item} ${invoice.term || ''} - KSh ${Number(invoice.balance_ksh ?? 0).toLocaleString()} due`,
        }))}
        team={team.map((member) => ({ id: member.id, label: member.name }))}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Students" value={students.length} />
        <Stat label="Enrolled" value={enrolled.length} />
        <Stat label="Parents" value={guardians.length} />
        <Stat label="Fee follow-ups" value={openFees.length} tone="text-amber-600" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Admin modules</h2>
          <div className="grid gap-2">
            {LINKS.map(([label, href]) => <Link key={href} href={href} className="rounded-lg border border-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:border-ocg-gold/50 hover:text-ocg-gold">{label}</Link>)}
          </div>
        </section>

        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">School admin status</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Mini label="Admissions in pipeline" value={pendingAdmissions.length} />
            <Mini label="Open admin tasks" value={adminTasks.filter((t) => t.status !== 'done').length} />
            <Mini label="Legacy fee snapshots" value={snapshots.length} />
          </div>
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
            Student fees are recorded from validated Excel imports (the canonical source) and appear in
            the brand finance workspace. Use this area to track parent follow-ups and connect fee/admin
            items back to Ops tasks.
          </p>
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value, tone = 'text-gray-900' }: { label: string; value: number; tone?: string }) {
  return <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"><p className={`text-3xl font-light ${tone}`}>{value}</p><p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p></div>
}
function Mini({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-gray-50 p-4"><p className="text-2xl font-light text-gray-900">{value}</p><p className="text-xs text-gray-400">{label}</p></div>
}

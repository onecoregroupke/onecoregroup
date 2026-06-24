import Link from 'next/link'
import { getRhythmsAdminData } from '@/lib/management'
import { RhythmsActionPanel } from '@/components/rhythms/RhythmsActionPanel'

export const dynamic = 'force-dynamic'

const LINKS = [
  ['Students', '/rhythms/students'],
  ['SchoolPay reconciliation', '/rhythms/schoolpay'],
] as const

export default async function RhythmsAdminPage() {
  const { students, batches, snapshots } = await getRhythmsAdminData()
  const enrolled = students.filter((s) => s.enrollment_status === 'enrolled' || s.enrollment_status === 'active')
  const totalExpected = snapshots.reduce((sum, s) => sum + Number(s.amount_expected_ksh ?? 0), 0)
  const balance = snapshots.reduce((sum, s) => sum + Number(s.balance_ksh ?? 0), 0)

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Rhythms College</p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">Rhythms Admin Layer</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-500">
          Student records and SchoolPay reconciliation for Rhythms College. SchoolPay remains the payment source of truth.
        </p>
      </div>

      <RhythmsActionPanel />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Students" value={students.length} />
        <Stat label="Active / enrolled" value={enrolled.length} />
        <Stat label="SchoolPay batches" value={batches.length} />
        <Stat label="Outstanding" value={balance} money tone="text-amber-600" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Admin modules</h2>
          <div className="grid gap-2">
            {LINKS.map(([label, href]) => <Link key={href} href={href} className="rounded-lg border border-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:border-ocg-gold/50 hover:text-ocg-gold">{label}</Link>)}
          </div>
        </section>
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">SchoolPay status</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Mini label="Snapshots" value={snapshots.length} />
            <Mini label="Expected" value={totalExpected} money />
            <Mini label="Outstanding" value={balance} money tone="text-amber-600" />
          </div>
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

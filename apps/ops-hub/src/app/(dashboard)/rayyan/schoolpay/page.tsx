import { getRayyanAdminData } from '@/lib/management'
import { SchoolpayImportForm } from '@/components/rayyan/SchoolpayImportForm'

export const dynamic = 'force-dynamic'

export default async function RayyanSchoolpayPage() {
  const { batches, snapshots } = await getRayyanAdminData()
  const totalExpected = snapshots.reduce((sum, s) => sum + Number(s.amount_expected_ksh ?? 0), 0)
  const totalPaid = snapshots.reduce((sum, s) => sum + Number(s.amount_paid_ksh ?? 0), 0)
  const balance = snapshots.reduce((sum, s) => sum + Number(s.balance_ksh ?? 0), 0)
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-semibold text-gray-900">SchoolPay reconciliation</h1><p className="text-sm text-gray-500">Import or capture SchoolPay snapshots here for reconciliation. This platform does not process fee payments.</p></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Import batches" value={batches.length} />
        <Stat label="Expected" value={totalExpected} money />
        <Stat label="Outstanding" value={balance} money tone="text-amber-600" />
      </div>
      <SchoolpayImportForm />
      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Latest snapshots</h2>
        {snapshots.length === 0 ? <p className="text-sm text-gray-500">No SchoolPay snapshots imported yet.</p> : <ul className="divide-y divide-gray-100">{snapshots.slice(0, 20).map((s) => <li key={s.id} className="flex justify-between gap-3 py-3 text-sm"><div><p className="font-medium text-gray-800">{s.student_name || s.schoolpay_code || 'Student'}</p><p className="text-xs text-gray-400">{s.fee_item || 'Fee item'} · {s.payment_status || 'status unknown'}</p></div><p className="text-gray-500">Paid KSh {Number(s.amount_paid_ksh ?? 0).toLocaleString()} / {Number(s.amount_expected_ksh ?? 0).toLocaleString()}</p></li>)}</ul>}
      </section>
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">CSV imports create snapshots only. Fee collection still stays in SchoolPay.</p>
    </div>
  )
}

function Stat({ label, value, money = false, tone = 'text-gray-900' }: { label: string; value: number; money?: boolean; tone?: string }) {
  return <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"><p className={`text-3xl font-light ${tone}`}>{money ? `KSh ${value.toLocaleString()}` : value}</p><p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p></div>
}

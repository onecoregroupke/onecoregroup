import { getRhythmsAdminData } from '@/lib/management'
import { SchoolpayImportForm } from '@/components/rayyan/SchoolpayImportForm'

export const dynamic = 'force-dynamic'

export default async function RhythmsSchoolpayPage() {
  const { batches, snapshots, invoices, payments, students } = await getRhythmsAdminData()
  const totalExpected = snapshots.reduce((sum, s) => sum + Number(s.amount_expected_ksh ?? 0), 0)
  const totalPaid = snapshots.reduce((sum, s) => sum + Number(s.amount_paid_ksh ?? 0), 0)
  const balance = snapshots.reduce((sum, s) => sum + Number(s.balance_ksh ?? 0), 0)
  const manualExpected = invoices.reduce((sum, invoice) => sum + Number(invoice.amount_expected_ksh ?? 0), 0)
  const manualPaid = invoices.reduce((sum, invoice) => sum + Number(invoice.amount_paid_ksh ?? 0), 0)
  const manualBalance = invoices.reduce((sum, invoice) => sum + Number(invoice.balance_ksh ?? 0), 0)
  const reconciledSnapshotIds = new Set(invoices.map((invoice) => invoice.schoolpay_snapshot_id).filter(Boolean))
  const unmatchedSnapshots = snapshots.filter((snapshot) => !reconciledSnapshotIds.has(snapshot.id))
  const studentById = new Map(students.map((student) => [student.id, student.full_name]))
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Rhythms SchoolPay reconciliation</h1>
        <p className="text-sm text-gray-500">Import SchoolPay snapshots and compare them with the internal manual fee ledger.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Import batches" value={batches.length} />
        <Stat label="SchoolPay expected" value={totalExpected} money />
        <Stat label="SchoolPay paid" value={totalPaid} money tone="text-emerald-600" />
        <Stat label="SchoolPay outstanding" value={balance} money tone="text-amber-600" />
        <Stat label="Manual paid" value={manualPaid} money tone="text-emerald-600" />
        <Stat label="Manual outstanding" value={manualBalance} money tone="text-amber-600" />
      </div>
      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Manual ledger</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Mini label="Manual invoices" value={invoices.length} />
          <Mini label="Manual expected" value={manualExpected} money />
          <Mini label="Manual payments" value={payments.length} />
        </div>
        <div className="mt-4 overflow-hidden rounded-lg border border-gray-100">
          {invoices.length === 0 ? <p className="p-4 text-sm text-gray-500">No manual Rhythms invoices yet. Use Rhythms Admin actions to add one.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400"><th className="px-3 py-2">Student</th><th className="px-3 py-2">Fee</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Balance</th></tr></thead>
              <tbody className="divide-y divide-gray-50">{invoices.slice(0, 12).map((invoice) => <tr key={invoice.id}><td className="px-3 py-2 font-medium text-gray-800">{invoice.student_id ? studentById.get(invoice.student_id) ?? 'Student' : invoice.schoolpay_code || 'Unlinked'}</td><td className="px-3 py-2 text-gray-500">{invoice.fee_item} {invoice.term}</td><td className="px-3 py-2 text-gray-500">{invoice.status}</td><td className="px-3 py-2 text-right text-gray-700">KSh {Number(invoice.balance_ksh ?? 0).toLocaleString()}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      </section>
      <SchoolpayImportForm endpoint="/api/rhythms/schoolpay-import" title="Import Rhythms SchoolPay CSV" />
      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Latest snapshots</h2>
        {snapshots.length === 0 ? <p className="text-sm text-gray-500">No SchoolPay snapshots imported yet.</p> : <ul className="divide-y divide-gray-100">{snapshots.slice(0, 20).map((s) => <li key={s.id} className="grid gap-2 py-3 text-sm sm:grid-cols-[1fr_auto]"><div><p className="font-medium text-gray-800">{s.student_name || s.schoolpay_code || 'Student'}</p><p className="text-xs text-gray-400">{s.fee_item || 'Fee item'} · {s.payment_status || 'status unknown'}</p></div><p className="text-gray-500">Paid KSh {Number(s.amount_paid_ksh ?? 0).toLocaleString()} / {Number(s.amount_expected_ksh ?? 0).toLocaleString()}</p></li>)}</ul>}
      </section>
      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Unmatched SchoolPay rows</h2>
        {unmatchedSnapshots.length === 0 ? <p className="text-sm text-gray-500">All imported rows are linked or there are no snapshots yet.</p> : <ul className="divide-y divide-gray-100">{unmatchedSnapshots.slice(0, 12).map((s) => <li key={s.id} className="grid gap-2 py-3 text-sm sm:grid-cols-[1fr_auto]"><div><p className="font-medium text-gray-800">{s.student_name || s.schoolpay_code || 'Student'}</p><p className="text-xs text-gray-400">{s.fee_item || 'Fee item'} · {s.payment_status || 'status unknown'}</p></div><p className="text-gray-500">Balance KSh {Number(s.balance_ksh ?? 0).toLocaleString()}</p></li>)}</ul>}
      </section>
    </div>
  )
}

function Stat({ label, value, money = false, tone = 'text-gray-900' }: { label: string; value: number; money?: boolean; tone?: string }) {
  return <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"><p className={`text-3xl font-light ${tone}`}>{money ? `KSh ${value.toLocaleString()}` : value}</p><p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p></div>
}
function Mini({ label, value, money = false }: { label: string; value: number; money?: boolean }) {
  return <div className="rounded-lg bg-gray-50 p-4"><p className="text-2xl font-light text-gray-900">{money ? `KSh ${value.toLocaleString()}` : value}</p><p className="text-xs text-gray-400">{label}</p></div>
}

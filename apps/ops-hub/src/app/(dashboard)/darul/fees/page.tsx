import { getDarulAdminData } from '@/lib/management'
import { DarulQuickAdd } from '@/components/darul/DarulQuickAdd'

export const dynamic = 'force-dynamic'

const INVOICE_TONE: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-700',
  partial: 'bg-amber-50 text-amber-700',
  unpaid: 'bg-red-50 text-red-700',
  waived: 'bg-gray-100 text-gray-500',
}

export default async function DarulFeesPage() {
  const { invoices, payments, feeFollowups, students } = await getDarulAdminData()
  const studentById = new Map(students.map((s) => [s.id, s.full_name]))
  const expected = invoices.reduce((s, i) => s + Number(i.amount_expected_ksh ?? 0), 0)
  const collected = invoices.reduce((s, i) => s + Number(i.amount_paid_ksh ?? 0), 0)
  const outstanding = invoices.reduce((s, i) => s + Number(i.balance_ksh ?? 0), 0)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Darul Swafa fees</h1>
        <p className="text-sm text-gray-500">Manual fee tracking — invoices, payments (M-Pesa / cash / bank), and follow-ups. No SchoolPay.</p>
      </div>

      <DarulQuickAdd />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Expected" value={expected} />
        <Stat label="Collected" value={collected} tone="text-emerald-600" />
        <Stat label="Outstanding" value={outstanding} tone="text-amber-600" />
      </div>

      <Section title={`Invoices (${invoices.length})`}>
        {invoices.length === 0 ? <Empty>No invoices yet.</Empty> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
              <th className="px-4 py-3">Student</th><th className="px-4 py-3">Fee item</th><th className="px-4 py-3">Term</th>
              <th className="px-4 py-3">Expected</th><th className="px-4 py-3">Paid</th><th className="px-4 py-3">Balance</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Due</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">{invoices.map((i) => (
              <tr key={i.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{i.student_id ? studentById.get(i.student_id) ?? '—' : '—'}</td>
                <td className="px-4 py-3 text-gray-500">{i.fee_item}</td>
                <td className="px-4 py-3 text-gray-500">{i.term || '—'}</td>
                <td className="px-4 py-3 text-gray-500">KSh {Number(i.amount_expected_ksh ?? 0).toLocaleString()}</td>
                <td className="px-4 py-3 text-gray-500">KSh {Number(i.amount_paid_ksh ?? 0).toLocaleString()}</td>
                <td className="px-4 py-3 font-medium text-gray-800">KSh {Number(i.balance_ksh ?? 0).toLocaleString()}</td>
                <td className="px-4 py-3"><span className={`rounded px-2 py-0.5 text-[11px] font-medium ${INVOICE_TONE[i.status] ?? 'bg-gray-100 text-gray-600'}`}>{i.status}</span></td>
                <td className="px-4 py-3 text-gray-500">{i.due_date || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Section>

      <Section title={`Payments (${payments.length})`}>
        {payments.length === 0 ? <Empty>No payments recorded yet.</Empty> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
              <th className="px-4 py-3">Date</th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Method</th><th className="px-4 py-3">Reference</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">{payments.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-500">{p.paid_on}</td>
                <td className="px-4 py-3 font-medium text-gray-800">{p.student_id ? studentById.get(p.student_id) ?? '—' : '—'}</td>
                <td className="px-4 py-3 text-gray-500">KSh {Number(p.amount_ksh ?? 0).toLocaleString()}</td>
                <td className="px-4 py-3 text-gray-500 capitalize">{p.method}</td>
                <td className="px-4 py-3 text-gray-500">{p.reference || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Section>

      <Section title={`Fee follow-ups (${feeFollowups.length})`}>
        {feeFollowups.length === 0 ? <Empty>No fee follow-ups.</Empty> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
              <th className="px-4 py-3">Student</th><th className="px-4 py-3">Fee item</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Next follow-up</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">{feeFollowups.map((f) => (
              <tr key={f.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{f.student_id ? studentById.get(f.student_id) ?? '—' : '—'}</td>
                <td className="px-4 py-3 text-gray-500">{f.expected_fee_item || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{f.follow_up_status}</td>
                <td className="px-4 py-3 text-gray-500">{f.next_follow_up_date || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
      <h2 className="border-b border-gray-100 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ocg-gold">{title}</h2>
      {children}
    </section>
  )
}
function Empty({ children }: { children: React.ReactNode }) { return <p className="p-6 text-sm text-gray-500">{children}</p> }
function Stat({ label, value, tone = 'text-gray-900' }: { label: string; value: number; tone?: string }) {
  return <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"><p className={`text-2xl font-light ${tone}`}>KSh {value.toLocaleString()}</p><p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p></div>
}

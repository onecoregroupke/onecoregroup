import { getNptServiceData } from '@/lib/management'

export const dynamic = 'force-dynamic'

export default async function NptReportsPage() {
  const { customers, pianos, jobs, history, quoteInvoices, reminders } = await getNptServiceData()
  const completed = jobs.filter((j) => j.status === 'Completed')
  const openJobs = jobs.filter((j) => j.status !== 'Completed' && j.status !== 'Cancelled')
  const unpaid = quoteInvoices.filter((r) => r.payment_status !== 'paid' && (r.invoice_amount_ksh ?? 0) > 0)
  const followups = reminders.filter((r) => r.status === 'pending')
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-semibold text-gray-900">NPT reports</h1><p className="text-sm text-gray-500">Service summary for leadership. Future versions can add Gazelle imports, revenue views, and route efficiency.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Customers" value={customers.length} />
        <Stat label="Pianos tracked" value={pianos.length} />
        <Stat label="Open jobs" value={openJobs.length} />
        <Stat label="Completed jobs" value={completed.length} />
        <Stat label="History records" value={history.length} />
        <Stat label="Pending reminders" value={followups.length} />
        <Stat label="Unpaid invoices" value={unpaid.length} tone="text-red-600" />
        <Stat label="Quote/invoice records" value={quoteInvoices.length} />
      </div>
    </div>
  )
}

function Stat({ label, value, tone = 'text-gray-900' }: { label: string; value: number; tone?: string }) {
  return <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"><p className={`text-3xl font-light ${tone}`}>{value.toLocaleString()}</p><p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p></div>
}

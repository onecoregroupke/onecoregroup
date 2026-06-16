import { getNptServiceData } from '@/lib/management'

export const dynamic = 'force-dynamic'

export default async function NptQuotesPage() {
  const { quoteInvoices, customers } = await getNptServiceData()
  const customerById = new Map(customers.map((c) => [c.id, c.full_name]))
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-semibold text-gray-900">Quotes & invoices</h1><p className="text-sm text-gray-500">Internal records only; this is not a full accounting system yet.</p></div>
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        {quoteInvoices.length === 0 ? <p className="p-6 text-sm text-gray-500">No quote or invoice records yet.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400"><th className="px-4 py-3">Record</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Payment</th></tr></thead>
            <tbody className="divide-y divide-gray-50">{quoteInvoices.map((r) => <tr key={r.id} className="hover:bg-gray-50"><td className="px-4 py-3"><p className="font-medium capitalize text-gray-800">{r.record_type}</p><p className="text-xs text-gray-400">{r.status}</p></td><td className="px-4 py-3 text-gray-500">{r.customer_id ? customerById.get(r.customer_id) ?? 'Customer' : '—'}</td><td className="px-4 py-3 text-gray-500">KSh {(r.invoice_amount_ksh ?? r.quote_amount_ksh ?? 0).toLocaleString()}</td><td className="px-4 py-3 text-gray-500">{r.payment_status}</td></tr>)}</tbody>
          </table>
        )}
      </div>
    </div>
  )
}

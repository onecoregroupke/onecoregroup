import { getNptServiceData } from '@/lib/management'

export const dynamic = 'force-dynamic'

export default async function NptPianosPage() {
  const { pianos, customers } = await getNptServiceData()
  const customerById = new Map(customers.map((c) => [c.id, c.full_name]))
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-semibold text-gray-900">Piano records</h1><p className="text-sm text-gray-500">Instrument records, condition, service dates, and sales status.</p></div>
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        {pianos.length === 0 ? <p className="p-6 text-sm text-gray-500">No pianos have been entered yet.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400"><th className="px-4 py-3">Piano</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Condition</th><th className="px-4 py-3">Next service</th></tr></thead>
            <tbody className="divide-y divide-gray-50">{pianos.map((p) => <tr key={p.id} className="hover:bg-gray-50"><td className="px-4 py-3 font-medium text-gray-800">{[p.make, p.model].filter(Boolean).join(' ') || p.piano_type}</td><td className="px-4 py-3 text-gray-500">{p.customer_id ? customerById.get(p.customer_id) ?? 'Customer' : '—'}</td><td className="px-4 py-3 text-gray-500">{p.condition || '—'}</td><td className="px-4 py-3 text-gray-500">{p.recommended_next_service_date || '—'}</td></tr>)}</tbody>
          </table>
        )}
      </div>
    </div>
  )
}

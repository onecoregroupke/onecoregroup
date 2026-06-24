import { getNptServiceData } from '@/lib/management'

export const dynamic = 'force-dynamic'

export default async function NptRemindersPage() {
  const { reminders, customers } = await getNptServiceData()
  const customerById = new Map(customers.map((c) => [c.id, c.full_name]))
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-semibold text-gray-900">NPT reminders</h1><p className="text-sm text-gray-500">Appointment, tuning, quote, invoice, repair recommendation, and piano sales follow-up reminders. Automation can be added after review flows are defined.</p></div>
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        {reminders.length === 0 ? <p className="p-6 text-sm text-gray-500">No reminders have been created yet.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400"><th className="px-4 py-3">Reminder</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Due</th><th className="px-4 py-3">Status</th></tr></thead>
            <tbody className="divide-y divide-gray-50">{reminders.map((r) => <tr key={r.id} className="hover:bg-gray-50"><td className="px-4 py-3"><p className="font-medium text-gray-800">{r.title}</p><p className="text-xs text-gray-400">{r.reminder_type}</p></td><td className="px-4 py-3 text-gray-500">{r.customer_id ? customerById.get(r.customer_id) ?? 'Customer' : '—'}</td><td className="px-4 py-3 text-gray-500">{r.due_at?.slice(0, 16).replace('T', ' ') || '—'}</td><td className="px-4 py-3 text-gray-500">{r.status}</td></tr>)}</tbody>
          </table>
        )}
      </div>
    </div>
  )
}

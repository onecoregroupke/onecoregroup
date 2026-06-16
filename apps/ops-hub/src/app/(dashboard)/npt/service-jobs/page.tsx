import { getNptServiceData } from '@/lib/management'

export const dynamic = 'force-dynamic'

export default async function NptServiceJobsPage() {
  const { jobs, customers, pianos, team } = await getNptServiceData()
  const customerById = new Map(customers.map((c) => [c.id, c.full_name]))
  const pianoById = new Map(pianos.map((p) => [p.id, [p.make, p.model].filter(Boolean).join(' ') || p.piano_type]))
  const techById = new Map(team.map((m) => [m.id, m.name]))
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-semibold text-gray-900">NPT service jobs</h1><p className="text-sm text-gray-500">Gazelle-inspired job workflow for tuning, repairs, assessment, movement, sales viewing, and follow-up.</p></div>
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        {jobs.length === 0 ? <p className="p-6 text-sm text-gray-500">No service jobs have been entered yet.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400"><th className="px-4 py-3">Job</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Technician</th><th className="px-4 py-3">Scheduled</th><th className="px-4 py-3">Status</th></tr></thead>
            <tbody className="divide-y divide-gray-50">{jobs.map((j) => <tr key={j.id} className="hover:bg-gray-50"><td className="px-4 py-3"><p className="font-medium text-gray-800">{j.service_type}</p><p className="text-xs text-gray-400">{j.piano_id ? pianoById.get(j.piano_id) : j.location || '—'}</p></td><td className="px-4 py-3 text-gray-500">{j.customer_id ? customerById.get(j.customer_id) ?? 'Customer' : '—'}</td><td className="px-4 py-3 text-gray-500">{j.technician_id ? techById.get(j.technician_id) ?? 'Technician' : '—'}</td><td className="px-4 py-3 text-gray-500">{j.scheduled_at?.slice(0, 16).replace('T', ' ') || '—'}</td><td className="px-4 py-3"><span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">{j.status}</span></td></tr>)}</tbody>
          </table>
        )}
      </div>
    </div>
  )
}

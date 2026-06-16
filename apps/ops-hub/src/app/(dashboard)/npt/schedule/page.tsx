import { getNptServiceData } from '@/lib/management'

export const dynamic = 'force-dynamic'

export default async function NptSchedulePage() {
  const { jobs, team } = await getNptServiceData()
  const techById = new Map(team.map((m) => [m.id, m.name]))
  const scheduled = jobs.filter((j) => j.scheduled_at).sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)))
  const byArea = new Map<string, number>()
  for (const job of jobs) byArea.set(job.location || 'Unspecified', (byArea.get(job.location || 'Unspecified') ?? 0) + 1)
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-semibold text-gray-900">Technician schedule</h1><p className="text-sm text-gray-500">Simple route planning by date, area, technician, and job status. Maps optimization can come later.</p></div>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Upcoming jobs</h2>
          {scheduled.length === 0 ? <p className="text-sm text-gray-500">No scheduled jobs yet.</p> : <ul className="divide-y divide-gray-100">{scheduled.map((j) => <li key={j.id} className="py-3 text-sm"><p className="font-medium text-gray-800">{j.scheduled_at?.slice(0, 16).replace('T', ' ')} · {j.service_type}</p><p className="text-xs text-gray-400">{j.location || 'No location'} · {j.technician_id ? techById.get(j.technician_id) ?? 'Technician' : 'unassigned'}</p></li>)}</ul>}
        </section>
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Jobs by area</h2>
          {byArea.size === 0 ? <p className="text-sm text-gray-500">No area data yet.</p> : <ul className="space-y-2">{[...byArea.entries()].map(([area, count]) => <li key={area} className="flex justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm"><span>{area}</span><span className="text-gray-500">{count}</span></li>)}</ul>}
        </section>
      </div>
    </div>
  )
}

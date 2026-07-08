import type { NptAppointmentRow } from '@ocg/db'
import { getNptServiceData } from '@/lib/management'
import { safeRows } from '@/lib/management'
import { formatEatDateTime, formatEatRange } from '@/lib/kenyaTime'

export const dynamic = 'force-dynamic'

export default async function NptSchedulePage() {
  const { jobs, team, customers, pianos } = await getNptServiceData()
  const appointments = await safeRows<NptAppointmentRow>('npt_appointments', { limit: 500, order: 'start_at', ascending: true })
  const techById = new Map(team.map((m) => [m.id, m.name]))
  const customerById = new Map(customers.map((c) => [c.id, c.full_name]))
  const pianoById = new Map(pianos.map((p) => [p.id, [p.make, p.model, p.piano_type].filter(Boolean).join(' ') || 'Piano']))
  const scheduled = jobs.filter((j) => j.scheduled_at).sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)))
  const scheduledAppointments = appointments.filter((a) => a.start_at).sort((a, b) => String(a.start_at).localeCompare(String(b.start_at)))
  const byArea = new Map<string, number>()
  for (const job of jobs) byArea.set(job.location || 'Unspecified', (byArea.get(job.location || 'Unspecified') ?? 0) + 1)
  for (const appointment of appointments) byArea.set(appointment.location || 'Unspecified', (byArea.get(appointment.location || 'Unspecified') ?? 0) + 1)
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-semibold text-gray-900">Technician schedule</h1><p className="text-sm text-gray-500">Gazelle-style appointment planning by date, area, technician, client, and piano.</p></div>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Upcoming appointments</h2>
          {scheduledAppointments.length === 0 ? <p className="text-sm text-gray-500">No appointments yet. Schedule from a customer or piano profile.</p> : <ul className="divide-y divide-gray-100">{scheduledAppointments.map((a) => <li key={a.id} className="py-3 text-sm"><p className="font-medium text-gray-800">{formatRange(a.start_at, a.end_at)} · {a.title}</p><p className="text-xs text-gray-400">{a.customer_id ? customerById.get(a.customer_id) ?? 'Customer' : 'No customer'} · {a.piano_id ? pianoById.get(a.piano_id) ?? 'Piano' : 'No piano'} · {a.technician_id ? techById.get(a.technician_id) ?? 'Technician' : 'unassigned'} · {a.location || 'No location'}</p></li>)}</ul>}
        </section>
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Legacy scheduled jobs</h2>
          {scheduled.length === 0 ? <p className="text-sm text-gray-500">No scheduled service jobs yet.</p> : <ul className="divide-y divide-gray-100">{scheduled.map((j) => <li key={j.id} className="py-3 text-sm"><p className="font-medium text-gray-800">{formatEatDateTime(j.scheduled_at)} · {j.service_type}</p><p className="text-xs text-gray-400">{j.location || 'No location'} · {j.technician_id ? techById.get(j.technician_id) ?? 'Technician' : 'unassigned'}</p></li>)}</ul>}
        </section>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Jobs by area</h2>
          {byArea.size === 0 ? <p className="text-sm text-gray-500">No area data yet.</p> : <ul className="space-y-2">{[...byArea.entries()].map(([area, count]) => <li key={area} className="flex justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm"><span>{area}</span><span className="text-gray-500">{count}</span></li>)}</ul>}
        </section>
        <section className="rounded-xl border border-amber-100 bg-amber-50 p-5 shadow-sm">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-700">Calendar availability</h2>
          <p className="text-sm text-amber-800">Scheduling is available for users with NPT access. If a tenant disables the module later, this view is ready to show a blocked state instead of an empty calendar.</p>
        </section>
      </div>
    </div>
  )
}

// Kenyan wall-clock display (Africa/Nairobi), independent of the server locale.
function formatRange(start: string | null, end: string | null) {
  return formatEatRange(start, end) || 'Unscheduled'
}

import Link from 'next/link'
import { NptActionPanel } from '@/components/npt/NptActionPanel'
import { getNptServiceData } from '@/lib/management'

export const dynamic = 'force-dynamic'

const NPT_LINKS = [
  ['Customers', '/npt/customers'],
  ['Pianos', '/npt/pianos'],
  ['Service jobs', '/npt/service-jobs'],
  ['Schedule', '/npt/schedule'],
  ['Technicians', '/npt/technicians'],
  ['Quotes & invoices', '/npt/quotes'],
  ['Reminders', '/npt/reminders'],
  ['Reports', '/npt/reports'],
] as const

export default async function NptServiceOsPage() {
  const { customers, pianos, jobs, history, quoteInvoices, reminders, team } = await getNptServiceData()
  const scheduled = jobs.filter((j) => j.scheduled_at || j.status === 'Scheduled')
  const unpaid = quoteInvoices.filter((r) => r.payment_status !== 'paid' && (r.invoice_amount_ksh ?? 0) > 0)
  const dueReminders = reminders.filter((r) => r.status === 'pending')

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">
          Nairobi Piano Technicians
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">NPT Service OS</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-500">
          Internal Gazelle-inspired service management for customers, pianos, jobs,
          technician scheduling, service history, reminders, and quote/invoice tracking.
          Gazelle import/export can be added once export/API requirements are available.
        </p>
      </div>

      <NptActionPanel
        customers={customers.map((customer) => ({ id: customer.id, label: customer.full_name }))}
        pianos={pianos.map((piano) => ({
          id: piano.id,
          label: [piano.make, piano.model, piano.piano_type].filter(Boolean).join(' ') || 'Piano',
        }))}
        jobs={jobs.map((job) => ({ id: job.id, label: `${job.service_type} · ${job.location || job.status}` }))}
        team={team.map((member) => ({ id: member.id, label: member.name }))}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Customers" value={customers.length} />
        <Stat label="Pianos" value={pianos.length} />
        <Stat label="Service jobs" value={jobs.length} />
        <Stat label="Due reminders" value={dueReminders.length} tone="text-amber-600" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Service modules</h2>
          <div className="grid gap-2">
            {NPT_LINKS.map(([label, href]) => (
              <Link key={href} href={href} className="rounded-lg border border-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:border-ocg-gold/50 hover:text-ocg-gold">
                {label}
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Current operations</h2>
          {jobs.length === 0 ? (
            <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
              No NPT service jobs have been entered yet. Start with customers, pianos, and jobs to begin moving away from the high-cost external service system.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Mini label="Scheduled" value={scheduled.length} />
              <Mini label="Service history" value={history.length} />
              <Mini label="Unpaid invoices" value={unpaid.length} tone="text-red-600" />
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value, tone = 'text-gray-900' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className={`text-3xl font-light ${tone}`}>{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
    </div>
  )
}

function Mini({ label, value, tone = 'text-gray-900' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-4">
      <p className={`text-2xl font-light ${tone}`}>{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  )
}

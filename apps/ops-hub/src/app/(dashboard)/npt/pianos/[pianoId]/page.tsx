import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ProfileActions } from '@/components/npt/ProfileActions'
import { Timeline } from '@/components/npt/Timeline'
import { getPianoProfile, nextTuningDue } from '@/lib/npt'

export const dynamic = 'force-dynamic'

export default async function NptPianoProfilePage({
  params,
}: {
  params: Promise<{ pianoId: string }>
}) {
  const { pianoId } = await params
  const { piano, customer, appointments, measurements, team, timeline } = await getPianoProfile(pianoId)
  if (!piano) notFound()

  return (
    <div className="space-y-6">
      <div>
        <Link href="/npt/pianos" className="text-xs text-gray-400 hover:text-ocg-gold">Back to pianos</Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-gray-900">{pianoLabel(piano)}</h1>
          {piano.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
        </div>
        <p className="mt-1 text-sm text-gray-500">{[customer?.full_name, piano.serial_number && `Serial ${piano.serial_number}`, piano.location].filter(Boolean).join(' · ') || 'No owner/location metadata yet.'}</p>
      </div>

      <ProfileActions
        customerId={piano.customer_id ?? undefined}
        pianoId={piano.id}
        technicians={team.map((member) => ({ id: member.id, label: member.name }))}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <Card title="Tuning schedule">
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <Info label="Last tuned" value={piano.last_tuning_date || '-'} />
              <Info label="Interval" value={`${piano.tuning_interval_months || 6} months`} />
              <Info label="Next due" value={nextTuningDue(piano) || '-'} />
            </dl>
          </Card>

          <Card title="Piano details">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Info label="Type" value={piano.piano_type || '-'} />
              <Info label="Make" value={piano.make || '-'} />
              <Info label="Model" value={piano.model || '-'} />
              <Info label="Serial number" value={piano.serial_number || '-'} />
              <Info label="Condition" value={piano.condition || '-'} />
              <Info label="Sales status" value={piano.sales_status || '-'} />
            </dl>
          </Card>

          <Card title="Linked client">
            {customer ? (
              <Link href={`/npt/customers/${customer.id}`} className="text-sm font-medium text-gray-800 hover:text-ocg-gold">{customer.full_name}</Link>
            ) : (
              <Empty>No customer linked to this piano.</Empty>
            )}
          </Card>

          <Card title="Notes">
            <p className="whitespace-pre-wrap text-sm text-gray-700">{piano.technician_notes || 'No technician notes captured yet.'}</p>
          </Card>

          <Card title="Measurements">
            {measurements.length === 0 ? <Empty>No measurements yet. Use the Measurement action to record temperature and humidity.</Empty> : (
              <ul className="divide-y divide-gray-100">
                {measurements.map((measurement) => (
                  <li key={measurement.id} className="py-3 text-sm">
                    <p className="font-medium text-gray-800">{formatDate(measurement.measured_at)}</p>
                    <p className="text-xs text-gray-500">{[measurement.temperature_c != null && `${measurement.temperature_c} C`, measurement.humidity_pct != null && `${measurement.humidity_pct}% RH`, measurement.notes].filter(Boolean).join(' · ')}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Appointments">
            {appointments.length === 0 ? <Empty>No appointments linked to this piano.</Empty> : (
              <ul className="divide-y divide-gray-100">
                {appointments.map((appointment) => <li key={appointment.id} className="py-3 text-sm"><p className="font-medium text-gray-800">{appointment.title}</p><p className="text-xs text-gray-500">{[appointment.start_at?.slice(0, 16).replace('T', ' '), appointment.status, appointment.location].filter(Boolean).join(' · ')}</p></li>)}
              </ul>
            )}
          </Card>
        </div>

        <Timeline items={timeline} />
      </div>
    </div>
  )
}

function pianoLabel(piano: { make: string; model: string | null; piano_type: string }) {
  return [piano.make, piano.model, piano.piano_type].filter(Boolean).join(' ') || 'Piano'
}

function formatDate(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ocg-gold">{title}</h2>{children}</section>
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-500">{children}</p>
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gray-500">{children}</span>
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-gray-400">{label}</dt><dd className="font-medium text-gray-700">{value}</dd></div>
}

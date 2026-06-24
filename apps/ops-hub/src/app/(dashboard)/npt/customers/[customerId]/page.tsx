import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ProfileActions } from '@/components/npt/ProfileActions'
import { Timeline } from '@/components/npt/Timeline'
import { getCustomerProfile, nextTuningDue } from '@/lib/npt'

export const dynamic = 'force-dynamic'

export default async function NptCustomerProfilePage({
  params,
}: {
  params: Promise<{ customerId: string }>
}) {
  const { customerId } = await params
  const { customer, contacts, pianos, reminders, team, timeline } = await getCustomerProfile(customerId)
  if (!customer) notFound()

  const preferredTech = customer.preferred_technician_id
    ? team.find((member) => member.id === customer.preferred_technician_id)?.name
    : ''

  return (
    <div className="space-y-6">
      <div>
        <Link href="/npt/customers" className="text-xs text-gray-400 hover:text-ocg-gold">Back to customers</Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-gray-900">{customer.full_name}</h1>
          {customer.customer_type && <Badge>{customer.customer_type}</Badge>}
          {customer.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
        </div>
        <p className="mt-1 text-sm text-gray-500">{[customer.company_name, customer.area_estate || customer.location, customer.phone || customer.email].filter(Boolean).join(' · ') || 'No contact metadata yet.'}</p>
      </div>

      <ProfileActions
        customerId={customer.id}
        pianos={pianos.map((piano) => ({ id: piano.id, label: pianoLabel(piano) }))}
        technicians={team.map((member) => ({ id: member.id, label: member.name }))}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <Card title="Contacts">
            {contacts.length === 0 ? (
              <Empty>No extra contacts yet. Use the action panel to add contact notes, or add contact records through the NPT operations form.</Empty>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {contacts.map((contact) => (
                  <li key={contact.id} className="rounded-lg border border-gray-100 p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-800">{contact.name}</p>
                      {contact.is_primary && <Badge>Primary</Badge>}
                      {contact.is_billing && <Badge>Billing</Badge>}
                    </div>
                    <p className="mt-1 text-gray-500">{[contact.role, contact.phone, contact.email].filter(Boolean).join(' · ') || 'No contact detail.'}</p>
                    {contact.notes && <p className="mt-2 text-xs text-gray-500">{contact.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Linked pianos">
            {pianos.length === 0 ? (
              <Empty>No pianos linked to this customer.</Empty>
            ) : (
              <ul className="divide-y divide-gray-100">
                {pianos.map((piano) => (
                  <li key={piano.id} className="py-3 text-sm">
                    <Link href={`/npt/pianos/${piano.id}`} className="font-medium text-gray-800 hover:text-ocg-gold">{pianoLabel(piano)}</Link>
                    <p className="mt-0.5 text-xs text-gray-500">{[piano.serial_number && `Serial ${piano.serial_number}`, piano.location, piano.condition, nextTuningDue(piano) && `Next tuning ${nextTuningDue(piano)}`].filter(Boolean).join(' · ') || 'No piano details yet.'}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Notes and preferences">
            <p className="whitespace-pre-wrap text-sm text-gray-700">{customer.notes || 'No notes captured yet.'}</p>
          </Card>

          <Card title="Additional info">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Info label="Preferred technician" value={preferredTech || '-'} />
              <Info label="Lead source" value={customer.lead_source || '-'} />
              <Info label="Preferred channel" value={customer.preferred_communication_channel || '-'} />
              <Info label="Referred by" value={customer.referred_by || '-'} />
              <Info label="Tax handling" value={customer.tax_exempt ? 'Tax exempt' : 'Standard'} />
              <Info label="Next follow-up" value={customer.next_follow_up_date || '-'} />
            </dl>
          </Card>

          <Card title="Upcoming reminders">
            {reminders.length === 0 ? <Empty>No pending reminders.</Empty> : (
              <ul className="divide-y divide-gray-100">
                {reminders.map((reminder) => <li key={reminder.id} className="py-3 text-sm"><p className="font-medium text-gray-800">{reminder.title}</p><p className="text-xs text-gray-500">{[reminder.due_at?.slice(0, 16).replace('T', ' '), reminder.channel, reminder.reminder_type].filter(Boolean).join(' · ')}</p></li>)}
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

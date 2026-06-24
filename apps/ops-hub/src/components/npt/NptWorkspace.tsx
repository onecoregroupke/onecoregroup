'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  HelpCircle,
  Home,
  Inbox,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Phone,
  Plus,
  ReceiptText,
  Search,
  Settings,
  SlidersHorizontal,
  Tags,
  Thermometer,
  UserRoundPlus,
  UsersRound,
  Wrench,
} from 'lucide-react'
import { api } from '@/lib/apiClient'
import { nextTuningDue } from '@/lib/npt'
import type {
  NptAppointmentRow,
  NptContactRow,
  NptCustomerRow,
  NptPianoMeasurementRow,
  NptPianoRow,
  NptQuoteInvoiceRow,
  NptReminderRow,
  NptServiceHistoryRow,
  NptServiceJobRow,
  NptTimelineEventRow,
  OpsTeamMemberRow,
} from '@ocg/db'

type ModuleKey = 'dashboard' | 'clients' | 'pianos' | 'calendar' | 'estimates' | 'invoices' | 'call_center' | 'messages' | 'settings'
type Selection = { kind: 'customer' | 'piano' | 'appointment' | 'job'; id: string } | null
type ActionKey = 'contact' | 'schedule' | 'estimate' | 'invoice' | 'status' | 'measurement' | 'reminder'
type TimelineType = 'appointment' | 'service' | 'measurement' | 'estimate' | 'invoice' | 'message' | 'call' | 'notice' | 'system' | 'reminder'

export interface NptWorkspaceData {
  customers: NptCustomerRow[]
  contacts: NptContactRow[]
  pianos: NptPianoRow[]
  jobs: NptServiceJobRow[]
  appointments: NptAppointmentRow[]
  history: NptServiceHistoryRow[]
  measurements: NptPianoMeasurementRow[]
  quoteInvoices: NptQuoteInvoiceRow[]
  reminders: NptReminderRow[]
  events: NptTimelineEventRow[]
  team: OpsTeamMemberRow[]
}

interface TimelineItem {
  id: string
  type: TimelineType
  title: string
  body: string
  when: string
  actor?: string
}

const MODULES: { key: ModuleKey; label: string; icon: React.ElementType }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: Home },
  { key: 'clients', label: 'Clients', icon: UsersRound },
  { key: 'pianos', label: 'Pianos', icon: Wrench },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays },
  { key: 'estimates', label: 'Estimates', icon: FileText },
  { key: 'invoices', label: 'Invoices', icon: ReceiptText },
  { key: 'call_center', label: 'Call Center', icon: Phone },
  { key: 'messages', label: 'Messages', icon: MessageSquare },
  { key: 'settings', label: 'Settings', icon: Settings },
]

const TIMELINE_FILTERS: { type: TimelineType; label: string; icon: React.ElementType }[] = [
  { type: 'appointment', label: 'Appointments', icon: CalendarDays },
  { type: 'service', label: 'Piano service history', icon: Wrench },
  { type: 'measurement', label: 'Piano measurements', icon: Thermometer },
  { type: 'estimate', label: 'Estimates', icon: FileText },
  { type: 'invoice', label: 'Invoices', icon: ReceiptText },
  { type: 'message', label: 'Messages', icon: MessageSquare },
  { type: 'call', label: 'Phone calls', icon: Phone },
  { type: 'notice', label: 'Notices', icon: Bell },
  { type: 'system', label: 'System logs', icon: SlidersHorizontal },
]

export function NptWorkspace({ data }: { data: NptWorkspaceData }) {
  const router = useRouter()
  const [module, setModule] = useState<ModuleKey>('clients')
  const [selection, setSelection] = useState<Selection>(() => initialSelection(data))
  const [query, setQuery] = useState('')
  const [activeAction, setActiveAction] = useState<ActionKey | null>(null)
  const [hiddenTypes, setHiddenTypes] = useState<Set<TimelineType>>(new Set())

  useEffect(() => {
    const next = firstSelectionForModule(module, data)
    if (next) setSelection(next)
  }, [module, data])

  const selectedCustomer = selection?.kind === 'customer'
    ? data.customers.find((customer) => customer.id === selection.id) ?? null
    : selectedPianoOwner(selection, data)
  const selectedPiano = selection?.kind === 'piano'
    ? data.pianos.find((piano) => piano.id === selection.id) ?? null
    : null
  const selectedAppointment = selection?.kind === 'appointment'
    ? data.appointments.find((appointment) => appointment.id === selection.id) ?? null
    : null
  const selectedJob = selection?.kind === 'job'
    ? data.jobs.find((job) => job.id === selection.id) ?? null
    : null

  const timeline = useMemo(() => buildTimeline(selection, data), [selection, data])
  const visibleTimeline = timeline.filter((item) => !hiddenTypes.has(item.type))

  function toggleType(type: TimelineType) {
    setHiddenTypes((current) => {
      const next = new Set(current)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  async function afterMutation() {
    setActiveAction(null)
    router.refresh()
  }

  return (
    <div className="-m-4 min-h-[calc(100vh-64px)] bg-[#eef1f4] text-[#263238] lg:-m-6">
      <div className="grid min-h-[calc(100vh-64px)] lg:grid-cols-[220px_minmax(0,1fr)_360px]">
        <aside className="border-r border-[#d7dde3] bg-[#f8fafb]">
          <div className="border-b border-[#d7dde3] px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7a8793]">Nairobi Piano</p>
            <h1 className="mt-1 text-lg font-semibold text-[#1c2833]">Technicians</h1>
          </div>
          <nav className="px-2 py-3">
            {MODULES.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setModule(key)}
                className={`flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm ${module === key ? 'bg-[#1c2833] text-white shadow-sm' : 'text-[#52606d] hover:bg-white hover:text-[#1c2833]'}`}
              >
                <Icon size={16} />
                <span className="flex-1">{label}</span>
                {module === key && <ChevronRight size={14} />}
              </button>
            ))}
          </nav>
          <div className="mt-auto border-t border-[#d7dde3] px-4 py-3 text-xs text-[#7a8793]">
            <button className="flex items-center gap-2 hover:text-[#1c2833]"><Plus size={14} /> New</button>
            <button className="mt-2 flex items-center gap-2 hover:text-[#1c2833]"><HelpCircle size={14} /> Help</button>
          </div>
        </aside>

        <main className="min-w-0 overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-[#d7dde3] bg-white px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#87929d]">Full NPT management</p>
              <h2 className="text-xl font-semibold text-[#1c2833]">{titleForModule(module)}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <WorkspaceAction action="contact" icon={MessageSquare} label="Contact" onClick={setActiveAction} />
              <WorkspaceAction action="schedule" icon={CalendarDays} label="Schedule" onClick={setActiveAction} />
              <WorkspaceAction action="estimate" icon={FileText} label="Estimate" onClick={setActiveAction} />
              <WorkspaceAction action="invoice" icon={ReceiptText} label="Invoice" onClick={setActiveAction} />
              <WorkspaceAction action="status" icon={CheckCircle2} label="Status" onClick={setActiveAction} />
              <WorkspaceAction action="reminder" icon={Bell} label="More" onClick={setActiveAction} />
            </div>
          </div>

          {activeAction && (
            <ActionDrawer
              action={activeAction}
              data={data}
              customer={selectedCustomer}
              piano={selectedPiano}
              onCancel={() => setActiveAction(null)}
              onSaved={afterMutation}
            />
          )}

          <div className="grid h-[calc(100vh-145px)] min-h-[720px] grid-cols-1 overflow-hidden xl:grid-cols-[330px_minmax(0,1fr)]">
            <section className="border-r border-[#d7dde3] bg-[#f8fafb]">
              <div className="border-b border-[#d7dde3] p-3">
                <label className="flex items-center gap-2 rounded border border-[#d7dde3] bg-white px-3 py-2 text-sm text-[#52606d]">
                  <Search size={15} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={`Search ${titleForModule(module).toLowerCase()}`}
                    className="w-full bg-transparent outline-none"
                  />
                </label>
              </div>
              <RecordList
                module={module}
                data={data}
                query={query}
                selection={selection}
                onSelect={setSelection}
              />
            </section>

            <section className="overflow-y-auto bg-white">
              <RecordDetail
                module={module}
                data={data}
                selection={selection}
                customer={selectedCustomer}
                piano={selectedPiano}
                appointment={selectedAppointment}
                job={selectedJob}
              />
            </section>
          </div>
        </main>

        <aside className="border-l border-[#d7dde3] bg-[#f8fafb]">
          <div className="flex items-center justify-between border-b border-[#d7dde3] bg-white px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-[#1c2833]">Timeline</h2>
              <p className="text-xs text-[#87929d]">{visibleTimeline.length} visible events</p>
            </div>
            {hiddenTypes.size > 0 && (
              <button onClick={() => setHiddenTypes(new Set())} className="text-xs font-medium text-[#3563a9]">Clear all</button>
            )}
          </div>
          <div className="grid grid-cols-[1fr_46px]">
            <div className="max-h-[calc(100vh-123px)] overflow-y-auto p-3">
              {visibleTimeline.length === 0 ? (
                <p className="rounded border border-dashed border-[#ccd4dc] bg-white p-4 text-sm text-[#7a8793]">No activity for this record yet.</p>
              ) : (
                <ol className="space-y-3">
                  {visibleTimeline.map((item) => <TimelineCard key={item.id} item={item} />)}
                </ol>
              )}
            </div>
            <div className="flex flex-col items-center gap-2 border-l border-[#d7dde3] bg-white py-3">
              {TIMELINE_FILTERS.map(({ type, label, icon: Icon }) => {
                const hidden = hiddenTypes.has(type)
                return (
                  <button
                    key={type}
                    title={`Show ${label.toLowerCase()}`}
                    onClick={() => toggleType(type)}
                    className={`flex h-8 w-8 items-center justify-center rounded ${hidden ? 'text-[#b0bbc5] hover:bg-[#f0f3f6]' : 'bg-[#e8edf2] text-[#263238]'}`}
                  >
                    <Icon size={15} />
                  </button>
                )
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function RecordList({
  module,
  data,
  query,
  selection,
  onSelect,
}: {
  module: ModuleKey
  data: NptWorkspaceData
  query: string
  selection: Selection
  onSelect: (selection: Selection) => void
}) {
  const q = query.trim().toLowerCase()
  const items = listItemsForModule(module, data).filter((item) => item.title.toLowerCase().includes(q) || item.meta.toLowerCase().includes(q))

  if (items.length === 0) return <p className="p-4 text-sm text-[#7a8793]">No matching records.</p>

  return (
    <div className="max-h-[calc(100vh-205px)] overflow-y-auto">
      {items.map((item) => {
        const active = selection?.kind === item.kind && selection.id === item.id
        return (
          <button
            key={`${item.kind}-${item.id}`}
            onClick={() => onSelect({ kind: item.kind, id: item.id })}
            className={`w-full border-b border-[#e3e8ed] px-4 py-3 text-left ${active ? 'bg-white' : 'bg-[#f8fafb] hover:bg-white'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="line-clamp-2 text-sm font-semibold text-[#263238]">{item.title}</p>
              {item.badge && <span className="rounded bg-[#e8edf2] px-2 py-0.5 text-[10px] font-semibold uppercase text-[#60707d]">{item.badge}</span>}
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-[#7a8793]">{item.meta || 'No details yet.'}</p>
          </button>
        )
      })}
    </div>
  )
}

function RecordDetail({
  module,
  data,
  selection,
  customer,
  piano,
  appointment,
  job,
}: {
  module: ModuleKey
  data: NptWorkspaceData
  selection: Selection
  customer: NptCustomerRow | null
  piano: NptPianoRow | null
  appointment: NptAppointmentRow | null
  job: NptServiceJobRow | null
}) {
  if (module === 'dashboard') return <DashboardDetail data={data} />
  if (!selection) return <EmptyDetail />

  if (selection.kind === 'piano' && piano) return <PianoDetail piano={piano} customer={customer} data={data} />
  if (selection.kind === 'appointment' && appointment) return <AppointmentDetail appointment={appointment} data={data} />
  if (selection.kind === 'job' && job) return <JobDetail job={job} data={data} />
  if (customer) return <CustomerDetail customer={customer} data={data} />

  return <EmptyDetail />
}

function CustomerDetail({ customer, data }: { customer: NptCustomerRow; data: NptWorkspaceData }) {
  const pianos = data.pianos.filter((piano) => piano.customer_id === customer.id)
  const contacts = data.contacts.filter((contact) => contact.customer_id === customer.id)
  const reminders = data.reminders.filter((reminder) => reminder.customer_id === customer.id && reminder.status === 'pending')
  const preferred = customer.preferred_technician_id ? data.team.find((member) => member.id === customer.preferred_technician_id)?.name : ''

  return (
    <div className="p-5">
      <RecordHeader eyebrow="Client profile" title={customer.full_name} meta={[customer.company_name, customer.area_estate || customer.location, customer.phone || customer.email].filter(Boolean).join(' · ')} tags={customer.tags} />
      <div className="mt-5 grid gap-4 2xl:grid-cols-2">
        <Panel title="Contacts">
          {contacts.length === 0 ? <Muted>No additional contacts yet.</Muted> : contacts.map((contact) => (
            <div key={contact.id} className="rounded border border-[#e3e8ed] p-3 text-sm">
              <p className="font-semibold">{contact.name} {contact.is_primary && <Pill>Primary</Pill>} {contact.is_billing && <Pill>Billing</Pill>}</p>
              <p className="mt-1 text-[#60707d]">{[contact.role, contact.phone, contact.email].filter(Boolean).join(' · ')}</p>
            </div>
          ))}
        </Panel>
        <Panel title="Linked pianos">
          {pianos.length === 0 ? <Muted>No pianos linked.</Muted> : pianos.map((item) => (
            <div key={item.id} className="rounded border border-[#e3e8ed] p-3 text-sm">
              <p className="font-semibold">{pianoLabel(item)}</p>
              <p className="mt-1 text-[#60707d]">{[item.location, item.condition, nextTuningDue(item) && `Next tuning ${nextTuningDue(item)}`].filter(Boolean).join(' · ')}</p>
            </div>
          ))}
        </Panel>
        <Panel title="Notes and preferences">
          <p className="whitespace-pre-wrap text-sm text-[#52606d]">{customer.notes || 'No notes captured yet.'}</p>
        </Panel>
        <Panel title="Additional info">
          <InfoGrid rows={[
            ['Client type', customer.customer_type || '-'],
            ['Preferred technician', preferred || '-'],
            ['Preferred channel', customer.preferred_communication_channel || '-'],
            ['Lead source', customer.lead_source || '-'],
            ['Referred by', customer.referred_by || '-'],
            ['Tax handling', customer.tax_exempt ? 'Tax exempt' : 'Standard'],
          ]} />
        </Panel>
        <Panel title="Upcoming messages and reminders">
          {reminders.length === 0 ? <Muted>No pending reminders.</Muted> : reminders.map((reminder) => <p key={reminder.id} className="rounded border border-[#e3e8ed] p-3 text-sm">{reminder.title}<span className="block text-xs text-[#7a8793]">{reminder.due_at?.slice(0, 16).replace('T', ' ') || 'No date'}</span></p>)}
        </Panel>
        <Panel title="Referral metadata">
          <InfoGrid rows={[['Referred by', customer.referred_by || '-'], ['Referred clients', 'Track via linked customer notes']]}/>
        </Panel>
      </div>
    </div>
  )
}

function PianoDetail({ piano, customer, data }: { piano: NptPianoRow; customer: NptCustomerRow | null; data: NptWorkspaceData }) {
  const measurements = data.measurements.filter((measurement) => measurement.piano_id === piano.id)
  return (
    <div className="p-5">
      <RecordHeader eyebrow="Piano profile" title={pianoLabel(piano)} meta={[customer?.full_name, piano.serial_number && `Serial ${piano.serial_number}`, piano.location].filter(Boolean).join(' · ')} tags={piano.tags} />
      <div className="mt-5 grid gap-4 2xl:grid-cols-2">
        <Panel title="Tuning schedule">
          <InfoGrid rows={[
            ['Last tuned', piano.last_tuning_date || '-'],
            ['Tuning interval', `${piano.tuning_interval_months || 6} months`],
            ['Next tuning due', nextTuningDue(piano) || '-'],
          ]} />
        </Panel>
        <Panel title="Piano details">
          <InfoGrid rows={[
            ['Type', piano.piano_type || '-'],
            ['Make', piano.make || '-'],
            ['Model', piano.model || '-'],
            ['Condition', piano.condition || '-'],
            ['Sales status', piano.sales_status || '-'],
            ['Location', piano.location || '-'],
          ]} />
        </Panel>
        <Panel title="Linked client">
          <p className="text-sm font-semibold">{customer?.full_name || 'No client linked'}</p>
          {customer && <p className="mt-1 text-xs text-[#7a8793]">{customer.phone || customer.email || customer.area_estate}</p>}
        </Panel>
        <Panel title="Measurements">
          {measurements.length === 0 ? <Muted>No measurements yet.</Muted> : measurements.slice(0, 5).map((measurement) => <p key={measurement.id} className="rounded border border-[#e3e8ed] p-3 text-sm">{[measurement.temperature_c != null && `${measurement.temperature_c} C`, measurement.humidity_pct != null && `${measurement.humidity_pct}% RH`].filter(Boolean).join(' · ') || 'Measurement'}<span className="block text-xs text-[#7a8793]">{dateOnly(measurement.measured_at)}</span></p>)}
        </Panel>
        <Panel title="Notes">
          <p className="whitespace-pre-wrap text-sm text-[#52606d]">{piano.technician_notes || 'No notes captured yet.'}</p>
        </Panel>
        <Panel title="Photos">
          <Muted>Photo gallery placeholder. Media upload can connect here next.</Muted>
        </Panel>
      </div>
    </div>
  )
}

function AppointmentDetail({ appointment, data }: { appointment: NptAppointmentRow; data: NptWorkspaceData }) {
  return (
    <div className="p-5">
      <RecordHeader eyebrow="Appointment" title={appointment.title || 'Appointment'} meta={[formatRange(appointment.start_at, appointment.end_at), appointment.location, appointment.status].filter(Boolean).join(' · ')} tags={[]} />
      <div className="mt-5 grid gap-4 2xl:grid-cols-2">
        <Panel title="Appointment details">
          <InfoGrid rows={[
            ['Client', appointment.customer_id ? customerName(data, appointment.customer_id) : '-'],
            ['Piano', appointment.piano_id ? pianoName(data, appointment.piano_id) : '-'],
            ['Technician', appointment.technician_id ? technicianName(data, appointment.technician_id) : '-'],
            ['Status', appointment.status],
            ['Created by', appointment.created_by || '-'],
            ['Completed', appointment.completed_at ? formatDateTime(appointment.completed_at) : '-'],
          ]} />
        </Panel>
        <Panel title="Notes">
          <p className="whitespace-pre-wrap text-sm text-[#52606d]">{appointment.notes || 'No notes captured yet.'}</p>
        </Panel>
      </div>
    </div>
  )
}

function JobDetail({ job, data }: { job: NptServiceJobRow; data: NptWorkspaceData }) {
  return (
    <div className="p-5">
      <RecordHeader eyebrow="Service job" title={job.service_type || 'Service job'} meta={[job.scheduled_at?.slice(0, 16).replace('T', ' '), job.location, job.status].filter(Boolean).join(' · ')} tags={[job.priority]} />
      <div className="mt-5 grid gap-4 2xl:grid-cols-2">
        <Panel title="Job details">
          <InfoGrid rows={[
            ['Client', job.customer_id ? customerName(data, job.customer_id) : '-'],
            ['Piano', job.piano_id ? pianoName(data, job.piano_id) : '-'],
            ['Technician', job.technician_id ? technicianName(data, job.technician_id) : '-'],
            ['Estimated cost', job.estimated_cost_ksh != null ? `KSh ${job.estimated_cost_ksh.toLocaleString()}` : '-'],
            ['Final cost', job.final_cost_ksh != null ? `KSh ${job.final_cost_ksh.toLocaleString()}` : '-'],
            ['Status', job.status],
          ]} />
        </Panel>
        <Panel title="Notes">
          <p className="whitespace-pre-wrap text-sm text-[#52606d]">{job.job_notes || job.completion_summary || 'No notes captured yet.'}</p>
        </Panel>
      </div>
    </div>
  )
}

function DashboardDetail({ data }: { data: NptWorkspaceData }) {
  const scheduled = data.appointments.filter((appointment) => appointment.status !== 'Completed').length
  const overdueReminders = data.reminders.filter((reminder) => reminder.status === 'pending' && reminder.due_at && reminder.due_at < new Date().toISOString()).length
  return (
    <div className="p-5">
      <RecordHeader eyebrow="Operations overview" title="NPT management console" meta="Clients, pianos, appointments, follow-ups, estimates, invoices, and service history." tags={[]} />
      <div className="mt-5 grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <Metric label="Clients" value={data.customers.length} />
        <Metric label="Pianos" value={data.pianos.length} />
        <Metric label="Open appointments" value={scheduled} />
        <Metric label="Overdue reminders" value={overdueReminders} />
      </div>
      <div className="mt-5 grid gap-4 2xl:grid-cols-2">
        <Panel title="Blocked calendar state">
          <p className="text-sm text-[#52606d]">If scheduling is disabled by permissions or a future subscription/module flag, this workspace should show billing/settings actions instead of silently empty calendar data.</p>
        </Panel>
        <Panel title="Workflow note">
          <p className="text-sm text-[#52606d]">Use client and piano records as the primary scheduling entry point. The standalone calendar is a planning surface, not the only way to create appointments.</p>
        </Panel>
      </div>
    </div>
  )
}

function ActionDrawer({
  action,
  data,
  customer,
  piano,
  onCancel,
  onSaved,
}: {
  action: ActionKey
  data: NptWorkspaceData
  customer: NptCustomerRow | null
  piano: NptPianoRow | null
  onCancel: () => void
  onSaved: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>({
    title: action === 'schedule' ? 'Appointment' : '',
    event_type: 'comment',
    record_type: action === 'invoice' ? 'invoice' : 'quote',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  async function submit() {
    setError('')
    const payload = payloadForAction(action, values, customer, piano)
    if ('error' in payload) {
      setError(payload.error ?? 'Unable to save this action.')
      return
    }
    setSaving(true)
    const { ok, data: response } = await api<{ error?: string }>('/api/npt', {
      method: 'POST',
      body: JSON.stringify(payload.body),
    })
    setSaving(false)
    if (!ok) {
      setError(response?.error ?? 'Failed to save.')
      return
    }
    onSaved()
  }

  return (
    <div className="border-b border-[#d7dde3] bg-[#fbfcfd] px-4 py-3">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8793]">{action}</p>
        <button onClick={onCancel} className="text-xs font-medium text-[#60707d] hover:text-[#263238]">Cancel</button>
      </div>
      <div className="grid gap-3 lg:grid-cols-4">
        {action === 'schedule' && (
          <>
            <Field label="Title"><input className="input" value={values.title ?? ''} onChange={(event) => set('title', event.target.value)} /></Field>
            <Field label="Piano"><Select value={values.piano_id ?? piano?.id ?? ''} onChange={(value) => set('piano_id', value)} options={data.pianos.map((item) => ({ id: item.id, label: pianoLabel(item) }))} empty="No piano" /></Field>
            <Field label="Technician"><Select value={values.technician_id ?? ''} onChange={(value) => set('technician_id', value)} options={data.team.map((member) => ({ id: member.id, label: member.name }))} empty="Unassigned" /></Field>
            <Field label="Start"><input type="datetime-local" className="input" value={values.start_at ?? ''} onChange={(event) => set('start_at', event.target.value)} /></Field>
            <Field label="End"><input type="datetime-local" className="input" value={values.end_at ?? ''} onChange={(event) => set('end_at', event.target.value)} /></Field>
            <Field label="Location"><input className="input" value={values.location ?? piano?.location ?? customer?.location ?? ''} onChange={(event) => set('location', event.target.value)} /></Field>
          </>
        )}
        {action === 'contact' && (
          <>
            <Field label="Type"><select className="input" value={values.event_type ?? 'comment'} onChange={(event) => set('event_type', event.target.value)}><option value="comment">Comment</option><option value="message">Message</option><option value="call">Phone call</option></select></Field>
            <Field label="Subject"><input className="input" value={values.title ?? ''} onChange={(event) => set('title', event.target.value)} /></Field>
            <Field label="Note"><input className="input" value={values.body ?? ''} onChange={(event) => set('body', event.target.value)} /></Field>
          </>
        )}
        {(action === 'estimate' || action === 'invoice') && (
          <>
            <Field label="Amount"><input type="number" className="input" value={values.amount ?? ''} onChange={(event) => set('amount', event.target.value)} /></Field>
            <Field label="Notes"><input className="input" value={values.notes ?? ''} onChange={(event) => set('notes', event.target.value)} /></Field>
          </>
        )}
        {action === 'measurement' && (
          <>
            <Field label="Temp C"><input type="number" step="0.1" className="input" value={values.temperature_c ?? ''} onChange={(event) => set('temperature_c', event.target.value)} /></Field>
            <Field label="Humidity %"><input type="number" step="0.1" className="input" value={values.humidity_pct ?? ''} onChange={(event) => set('humidity_pct', event.target.value)} /></Field>
            <Field label="Technician"><Select value={values.technician_id ?? ''} onChange={(value) => set('technician_id', value)} options={data.team.map((member) => ({ id: member.id, label: member.name }))} empty="Unassigned" /></Field>
            <Field label="Notes"><input className="input" value={values.notes ?? ''} onChange={(event) => set('notes', event.target.value)} /></Field>
          </>
        )}
        {action === 'status' && (
          <>
            <Field label="Status note"><input className="input" value={values.body ?? ''} onChange={(event) => set('body', event.target.value)} /></Field>
            <Field label="Type"><select className="input" value={values.event_type ?? 'notice'} onChange={(event) => set('event_type', event.target.value)}><option value="notice">Notice</option><option value="system">System log</option></select></Field>
          </>
        )}
        {action === 'reminder' && (
          <>
            <Field label="Reminder"><input className="input" value={values.title ?? ''} onChange={(event) => set('title', event.target.value)} /></Field>
            <Field label="Due"><input type="datetime-local" className="input" value={values.due_at ?? ''} onChange={(event) => set('due_at', event.target.value)} /></Field>
            <Field label="Channel"><input className="input" value={values.channel ?? 'WhatsApp'} onChange={(event) => set('channel', event.target.value)} /></Field>
          </>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex justify-end">
        <button onClick={submit} disabled={saving} className="rounded bg-[#1c2833] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2e4052] disabled:opacity-60">{saving ? 'Saving...' : 'Save'}</button>
      </div>
    </div>
  )
}

function payloadForAction(action: ActionKey, values: Record<string, string>, customer: NptCustomerRow | null, piano: NptPianoRow | null) {
  const customerId = customer?.id ?? piano?.customer_id ?? ''
  const pianoId = piano?.id ?? values.piano_id ?? ''
  if (action === 'schedule') {
    return { body: { type: 'npt_appointment', values: { customer_id: customerId, piano_id: pianoId, technician_id: values.technician_id, title: values.title || 'Appointment', start_at: values.start_at, end_at: values.end_at, location: values.location, status: 'Scheduled' } } }
  }
  if (action === 'contact' || action === 'status') {
    if (!values.body?.trim()) return { error: 'Add a note before saving.' }
    return { body: { type: 'npt_timeline', values: { customer_id: customerId, piano_id: pianoId, event_type: values.event_type || 'comment', title: values.title, body: values.body } } }
  }
  if (action === 'estimate' || action === 'invoice') {
    const isInvoice = action === 'invoice'
    return { body: { type: 'npt_quote', values: { customer_id: customerId, record_type: isInvoice ? 'invoice' : 'quote', [isInvoice ? 'invoice_amount_ksh' : 'quote_amount_ksh']: values.amount, notes: values.notes, status: 'draft' } } }
  }
  if (action === 'measurement') {
    if (!pianoId) return { error: 'Select a piano before recording measurements.' }
    return { body: { type: 'npt_measurement', values: { piano_id: pianoId, technician_id: values.technician_id, temperature_c: values.temperature_c, humidity_pct: values.humidity_pct, notes: values.notes } } }
  }
  return { body: { type: 'npt_reminder', values: { customer_id: customerId, piano_id: pianoId, title: values.title, due_at: values.due_at, channel: values.channel, reminder_type: 'follow_up' } } }
}

function WorkspaceAction({ action, icon: Icon, label, onClick }: { action: ActionKey; icon: React.ElementType; label: string; onClick: (action: ActionKey) => void }) {
  return <button onClick={() => onClick(action)} className="inline-flex items-center gap-1.5 rounded border border-[#ccd4dc] bg-[#fbfcfd] px-3 py-2 text-sm font-medium text-[#384854] hover:bg-[#eef3f7]"><Icon size={15} /> {label}</button>
}

function TimelineCard({ item }: { item: TimelineItem }) {
  return (
    <li className="rounded border border-[#dfe5ea] bg-white p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#87929d]">{labelForTimeline(item.type)}</p>
      <p className="mt-1 text-sm font-semibold text-[#263238]">{item.title}</p>
      {item.body && <p className="mt-1 text-xs text-[#60707d]">{item.body}</p>}
      <p className="mt-2 text-[11px] text-[#96a0aa]">{formatDateTime(item.when)}{item.actor ? ` · ${item.actor}` : ''}</p>
    </li>
  )
}

function RecordHeader({ eyebrow, title, meta, tags }: { eyebrow: string; title: string; meta: string; tags: string[] }) {
  return (
    <div className="border-b border-[#e3e8ed] pb-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#87929d]">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-semibold text-[#1c2833]">{title}</h2>
      {meta && <p className="mt-1 text-sm text-[#60707d]">{meta}</p>}
      {tags.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{tags.map((tag) => <Pill key={tag}>{tag}</Pill>)}</div>}
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded border border-[#dfe5ea] bg-[#fbfcfd] p-4"><h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8793]">{title}</h3><div className="space-y-2">{children}</div></section>
}

function InfoGrid({ rows }: { rows: [string, string][] }) {
  return <dl className="grid gap-3 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label}><dt className="text-xs text-[#87929d]">{label}</dt><dd className="text-sm font-semibold text-[#384854]">{value}</dd></div>)}</dl>
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded border border-[#dfe5ea] bg-[#fbfcfd] p-4"><p className="text-3xl font-light text-[#1c2833]">{value}</p><p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8793]">{label}</p></div>
}

function EmptyDetail() {
  return <div className="p-5"><Muted>Select a record from the list to open its profile.</Muted></div>
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[#7a8793]">{children}</p>
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="ml-1 inline-flex rounded bg-[#e8edf2] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#60707d]">{children}</span>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-[#60707d]">{label}</span>{children}</label>
}

function Select({ options, value, onChange, empty }: { options: { id: string; label: string }[]; value: string; onChange: (value: string) => void; empty: string }) {
  return <select className="input" value={value} onChange={(event) => onChange(event.target.value)}><option value="">{empty}</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
}

function initialSelection(data: NptWorkspaceData): Selection {
  return data.customers[0] ? { kind: 'customer', id: data.customers[0].id } : data.pianos[0] ? { kind: 'piano', id: data.pianos[0].id } : null
}

function firstSelectionForModule(module: ModuleKey, data: NptWorkspaceData): Selection {
  if (module === 'clients' || module === 'call_center' || module === 'messages') return data.customers[0] ? { kind: 'customer', id: data.customers[0].id } : null
  if (module === 'pianos') return data.pianos[0] ? { kind: 'piano', id: data.pianos[0].id } : null
  if (module === 'calendar') return data.appointments[0] ? { kind: 'appointment', id: data.appointments[0].id } : data.jobs[0] ? { kind: 'job', id: data.jobs[0].id } : null
  if (module === 'estimates') {
    const estimate = data.quoteInvoices.find((item) => item.record_type !== 'invoice')
    return estimate?.customer_id ? { kind: 'customer', id: estimate.customer_id } : initialSelection(data)
  }
  if (module === 'invoices') {
    const invoice = data.quoteInvoices.find((item) => item.record_type === 'invoice')
    return invoice?.customer_id ? { kind: 'customer', id: invoice.customer_id } : initialSelection(data)
  }
  return initialSelection(data)
}

function listItemsForModule(module: ModuleKey, data: NptWorkspaceData): { kind: 'customer' | 'piano' | 'appointment' | 'job'; id: string; title: string; meta: string; badge?: string }[] {
  if (module === 'pianos') return data.pianos.map((piano) => ({ kind: 'piano', id: piano.id, title: pianoLabel(piano), meta: [customerName(data, piano.customer_id), piano.location, nextTuningDue(piano) && `Next ${nextTuningDue(piano)}`].filter(Boolean).join(' · '), badge: piano.condition || piano.piano_type }))
  if (module === 'calendar') {
    return [
      ...data.appointments.map((appointment) => ({ kind: 'appointment' as const, id: appointment.id, title: appointment.title || 'Appointment', meta: [formatRange(appointment.start_at, appointment.end_at), customerName(data, appointment.customer_id), technicianName(data, appointment.technician_id)].filter(Boolean).join(' · '), badge: appointment.status })),
      ...data.jobs.filter((job) => job.scheduled_at).map((job) => ({ kind: 'job' as const, id: job.id, title: job.service_type || 'Service job', meta: [job.scheduled_at?.slice(0, 16).replace('T', ' '), customerName(data, job.customer_id), technicianName(data, job.technician_id)].filter(Boolean).join(' · '), badge: job.status })),
    ]
  }
  return data.customers.map((customer) => ({ kind: 'customer', id: customer.id, title: customer.full_name, meta: [customer.phone || customer.email, customer.area_estate || customer.location, customer.next_follow_up_date && `Follow-up ${customer.next_follow_up_date}`].filter(Boolean).join(' · '), badge: customer.customer_type }))
}

function buildTimeline(selection: Selection, data: NptWorkspaceData): TimelineItem[] {
  const items: TimelineItem[] = []
  const customerId = selection?.kind === 'customer' ? selection.id : selection?.kind === 'piano' ? data.pianos.find((piano) => piano.id === selection.id)?.customer_id : selection?.kind === 'appointment' ? data.appointments.find((appointment) => appointment.id === selection.id)?.customer_id : selection?.kind === 'job' ? data.jobs.find((job) => job.id === selection.id)?.customer_id : null
  const pianoId = selection?.kind === 'piano' ? selection.id : selection?.kind === 'appointment' ? data.appointments.find((appointment) => appointment.id === selection.id)?.piano_id : selection?.kind === 'job' ? data.jobs.find((job) => job.id === selection.id)?.piano_id : null
  const matches = (customer?: string | null, piano?: string | null) => Boolean((customerId && customer === customerId) || (pianoId && piano === pianoId))

  for (const appointment of data.appointments.filter((item) => matches(item.customer_id, item.piano_id))) {
    items.push({ id: `a-${appointment.id}`, type: 'appointment', title: appointment.title || 'Appointment', body: [formatRange(appointment.start_at, appointment.end_at), technicianName(data, appointment.technician_id), appointment.status].filter(Boolean).join(' · '), when: appointment.start_at || appointment.created_at, actor: technicianName(data, appointment.technician_id) })
  }
  for (const job of data.jobs.filter((item) => matches(item.customer_id, item.piano_id))) {
    items.push({ id: `j-${job.id}`, type: 'appointment', title: job.service_type || 'Service job', body: [job.status, job.location, technicianName(data, job.technician_id)].filter(Boolean).join(' · '), when: job.scheduled_at || job.created_at, actor: technicianName(data, job.technician_id) })
  }
  for (const history of data.history.filter((item) => matches(item.customer_id, item.piano_id))) {
    items.push({ id: `h-${history.id}`, type: 'service', title: 'Service completed', body: [history.work_done, history.recommendations].filter(Boolean).join(' · '), when: history.created_at || `${history.service_date}T00:00:00.000Z`, actor: technicianName(data, history.technician_id) })
  }
  for (const measurement of data.measurements.filter((item) => pianoId && item.piano_id === pianoId)) {
    items.push({ id: `m-${measurement.id}`, type: 'measurement', title: 'Piano measurement', body: [measurement.temperature_c != null && `${measurement.temperature_c} C`, measurement.humidity_pct != null && `${measurement.humidity_pct}% RH`, measurement.notes].filter(Boolean).join(' · '), when: measurement.measured_at, actor: technicianName(data, measurement.technician_id) })
  }
  for (const quote of data.quoteInvoices.filter((item) => customerId && item.customer_id === customerId)) {
    const isInvoice = quote.record_type === 'invoice'
    items.push({ id: `q-${quote.id}`, type: isInvoice ? 'invoice' : 'estimate', title: isInvoice ? 'Invoice' : 'Estimate', body: [`KSh ${Number(isInvoice ? quote.invoice_amount_ksh ?? 0 : quote.quote_amount_ksh ?? 0).toLocaleString()}`, quote.status, isInvoice && quote.payment_status].filter(Boolean).join(' · '), when: quote.created_at })
  }
  for (const reminder of data.reminders.filter((item) => matches(item.customer_id, item.piano_id))) {
    items.push({ id: `r-${reminder.id}`, type: 'reminder', title: reminder.title, body: [reminder.channel, reminder.status].filter(Boolean).join(' · '), when: reminder.due_at || reminder.created_at })
  }
  for (const event of data.events.filter((item) => matches(item.customer_id, item.piano_id))) {
    items.push({ id: `e-${event.id}`, type: normalizeEventType(event.event_type), title: event.title || labelForTimeline(normalizeEventType(event.event_type)), body: event.body, when: event.occurred_at || event.created_at, actor: event.actor })
  }
  return items.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
}

function selectedPianoOwner(selection: Selection, data: NptWorkspaceData) {
  const piano = selection?.kind === 'piano' ? data.pianos.find((item) => item.id === selection.id) : null
  return piano?.customer_id ? data.customers.find((customer) => customer.id === piano.customer_id) ?? null : null
}

function titleForModule(module: ModuleKey) {
  return MODULES.find((item) => item.key === module)?.label ?? 'NPT'
}

function pianoLabel(piano: Pick<NptPianoRow, 'make' | 'model' | 'piano_type'>) {
  return [piano.make, piano.model, piano.piano_type].filter(Boolean).join(' ') || 'Unknown Piano'
}

function customerName(data: NptWorkspaceData, id: string | null | undefined) {
  return id ? data.customers.find((customer) => customer.id === id)?.full_name ?? 'Client' : ''
}

function pianoName(data: NptWorkspaceData, id: string | null | undefined) {
  const piano = id ? data.pianos.find((item) => item.id === id) : null
  return piano ? pianoLabel(piano) : ''
}

function technicianName(data: NptWorkspaceData, id: string | null | undefined) {
  return id ? data.team.find((member) => member.id === id)?.name ?? 'Technician' : ''
}

function formatRange(start: string | null, end: string | null) {
  if (!start) return ''
  const s = new Date(start)
  const first = s.toLocaleString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  if (!end) return first
  const e = new Date(end)
  const mins = Math.max(0, Math.round((e.getTime() - s.getTime()) / 60000))
  const duration = mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}` : `${mins}m`
  return `${first} - ${e.toLocaleTimeString('en-KE', { hour: 'numeric', minute: '2-digit' })} · ${duration}`
}

function dateOnly(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function normalizeEventType(type: string): TimelineType {
  if (type === 'message' || type === 'call' || type === 'notice' || type === 'system') return type
  return 'message'
}

function labelForTimeline(type: TimelineType) {
  return ({
    appointment: 'Appointment',
    service: 'Piano service history',
    measurement: 'Piano measurement',
    estimate: 'Estimate',
    invoice: 'Invoice',
    message: 'Message',
    call: 'Phone call',
    notice: 'Notice',
    system: 'System log',
    reminder: 'Reminder',
  })[type]
}

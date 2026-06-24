import { db, nowIso } from './serverClient'
import { listTeam } from './team'
import { safeRows } from './management'
import type {
  NptAppointmentRow, NptContactRow, NptCustomerRow, NptPianoMeasurementRow,
  NptPianoRow, NptQuoteInvoiceRow, NptReminderRow, NptServiceHistoryRow, NptTimelineEventRow,
} from '@ocg/db'

export type TimelineType =
  | 'appointment' | 'service_history' | 'measurement' | 'estimate' | 'invoice'
  | 'comment' | 'notice' | 'system' | 'message' | 'call'

export interface TimelineItem {
  id: string
  type: TimelineType
  title: string
  body?: string
  who?: string
  when: string // ISO
}

/** Next tuning due = last tuned + interval months, unless an explicit
 *  recommended_next_service_date override is set. */
export function nextTuningDue(piano: Pick<NptPianoRow, 'last_tuning_date' | 'tuning_interval_months' | 'recommended_next_service_date'>): string | null {
  if (piano.recommended_next_service_date) return piano.recommended_next_service_date
  if (!piano.last_tuning_date) return null
  const d = new Date(`${piano.last_tuning_date.slice(0, 10)}T00:00:00.000Z`)
  d.setMonth(d.getMonth() + (piano.tuning_interval_months || 6))
  return d.toISOString().slice(0, 10)
}

function teamNamer(team: { id: string; name: string }[]) {
  const m = new Map(team.map((t) => [t.id, t.name]))
  return (id: string | null | undefined) => (id ? m.get(id) ?? '' : '')
}

function fmtRange(start: string | null, end: string | null): string {
  if (!start) return ''
  const s = new Date(start)
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }
  const startStr = s.toLocaleTimeString('en-KE', opts)
  if (!end) return startStr
  const e = new Date(end)
  const mins = Math.round((e.getTime() - s.getTime()) / 60000)
  const dur = mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}` : `${mins}m`
  return `${startStr} – ${e.toLocaleTimeString('en-KE', opts)} · ${dur}`
}

function mergeTimeline(parts: {
  appointments?: NptAppointmentRow[]
  history?: NptServiceHistoryRow[]
  measurements?: NptPianoMeasurementRow[]
  quotes?: NptQuoteInvoiceRow[]
  events?: NptTimelineEventRow[]
  name: (id: string | null | undefined) => string
}): TimelineItem[] {
  const items: TimelineItem[] = []
  for (const a of parts.appointments ?? []) {
    items.push({
      id: `appt-${a.id}`,
      type: 'appointment',
      title: `${a.title || 'Appointment'}${a.location ? ` · ${a.location}` : ''}`,
      body: [fmtRange(a.start_at, a.end_at), parts.name(a.technician_id) && `with ${parts.name(a.technician_id)}`, a.status].filter(Boolean).join(' · '),
      who: parts.name(a.technician_id),
      when: a.start_at || a.created_at,
    })
  }
  for (const h of parts.history ?? []) {
    items.push({
      id: `hist-${h.id}`,
      type: 'service_history',
      title: 'Service completed',
      body: [h.work_done, h.recommendations && `Rec: ${h.recommendations}`, h.next_service_date && `Next: ${h.next_service_date}`].filter(Boolean).join(' · '),
      who: parts.name(h.technician_id),
      when: h.created_at || `${h.service_date}T00:00:00.000Z`,
    })
  }
  for (const m of parts.measurements ?? []) {
    items.push({
      id: `meas-${m.id}`,
      type: 'measurement',
      title: 'Piano measurement',
      body: [m.temperature_c != null && `${m.temperature_c}°C`, m.humidity_pct != null && `${m.humidity_pct}% RH`, m.notes].filter(Boolean).join(' · '),
      who: parts.name(m.technician_id),
      when: m.measured_at,
    })
  }
  for (const q of parts.quotes ?? []) {
    const isInvoice = q.record_type === 'invoice'
    items.push({
      id: `qi-${q.id}`,
      type: isInvoice ? 'invoice' : 'estimate',
      title: isInvoice ? 'Invoice' : 'Estimate',
      body: [
        (isInvoice ? q.invoice_amount_ksh : q.quote_amount_ksh) != null && `KSh ${Number(isInvoice ? q.invoice_amount_ksh : q.quote_amount_ksh).toLocaleString()}`,
        q.status, isInvoice && q.payment_status,
      ].filter(Boolean).join(' · '),
      when: q.created_at,
    })
  }
  for (const e of parts.events ?? []) {
    items.push({
      id: `ev-${e.id}`,
      type: (e.event_type as TimelineType) || 'comment',
      title: e.title || titleForEventType(e.event_type),
      body: e.body,
      who: e.actor,
      when: e.occurred_at || e.created_at,
    })
  }
  return items.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
}

function titleForEventType(t: string): string {
  return ({ comment: 'Comment', notice: 'Notice', system: 'System', message: 'Message', call: 'Phone call' } as Record<string, string>)[t] ?? 'Event'
}

export async function getCustomerProfile(customerId: string) {
  const supabase = db()
  const [{ data: customer }, contacts, pianos, appointments, history, quotes, reminders, events, team] = await Promise.all([
    supabase.from('npt_customers').select('*').eq('id', customerId).maybeSingle(),
    safeRows<NptContactRow>('npt_contacts', {}).then((rows) => rows.filter((r) => r.customer_id === customerId)),
    safeRows<NptPianoRow>('npt_pianos', {}).then((rows) => rows.filter((r) => r.customer_id === customerId)),
    safeRows<NptAppointmentRow>('npt_appointments', {}).then((rows) => rows.filter((r) => r.customer_id === customerId)),
    safeRows<NptServiceHistoryRow>('npt_service_history', {}).then((rows) => rows.filter((r) => r.customer_id === customerId)),
    safeRows<NptQuoteInvoiceRow>('npt_quote_invoice_records', {}).then((rows) => rows.filter((r) => r.customer_id === customerId)),
    safeRows<NptReminderRow>('npt_reminders', {}).then((rows) => rows.filter((r) => r.customer_id === customerId && r.status === 'pending')),
    safeRows<NptTimelineEventRow>('npt_timeline_events', {}).then((rows) => rows.filter((r) => r.customer_id === customerId)),
    listTeam(),
  ])
  const name = teamNamer(team)
  const timeline = mergeTimeline({ appointments, history, quotes, events, name })
  return { customer: (customer as NptCustomerRow | null), contacts, pianos, appointments, reminders, team, timeline }
}

export async function getPianoProfile(pianoId: string) {
  const supabase = db()
  const [{ data: piano }, appointments, history, measurements, events, team] = await Promise.all([
    supabase.from('npt_pianos').select('*').eq('id', pianoId).maybeSingle(),
    safeRows<NptAppointmentRow>('npt_appointments', {}).then((rows) => rows.filter((r) => r.piano_id === pianoId)),
    safeRows<NptServiceHistoryRow>('npt_service_history', {}).then((rows) => rows.filter((r) => r.piano_id === pianoId)),
    safeRows<NptPianoMeasurementRow>('npt_piano_measurements', {}).then((rows) => rows.filter((r) => r.piano_id === pianoId)),
    safeRows<NptTimelineEventRow>('npt_timeline_events', {}).then((rows) => rows.filter((r) => r.piano_id === pianoId)),
    listTeam(),
  ])
  const p = piano as NptPianoRow | null
  const customer = p?.customer_id
    ? ((await supabase.from('npt_customers').select('*').eq('id', p.customer_id).maybeSingle()).data as NptCustomerRow | null)
    : null
  const name = teamNamer(team)
  const timeline = mergeTimeline({ appointments, history, measurements, events, name })
  return { piano: p, customer, appointments, measurements, team, timeline }
}

/** Mark an appointment complete: stamp it, write service history, and roll the
 *  piano's tuning schedule forward (last tuned today, next due from interval). */
export async function completeAppointment(
  id: string,
  opts: { summary?: string; recommendations?: string } = {},
) {
  const supabase = db()
  const { data: appt } = await supabase.from('npt_appointments').select('*').eq('id', id).single()
  if (!appt) throw new Error('Appointment not found')
  const a = appt as NptAppointmentRow

  const { data, error } = await supabase
    .from('npt_appointments')
    .update({ status: 'Completed', completed_at: nowIso(), updated_at: nowIso() })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)

  await supabase.from('npt_service_history').insert({
    customer_id: a.customer_id,
    piano_id: a.piano_id,
    technician_id: a.technician_id,
    service_date: nowIso().slice(0, 10),
    work_done: opts.summary ?? a.notes ?? '',
    recommendations: opts.recommendations ?? '',
  })

  if (a.piano_id) {
    const { data: piano } = await supabase.from('npt_pianos').select('*').eq('id', a.piano_id).single()
    const next = piano ? nextTuningDue({ last_tuning_date: nowIso().slice(0, 10), tuning_interval_months: (piano as NptPianoRow).tuning_interval_months, recommended_next_service_date: null }) : null
    await supabase
      .from('npt_pianos')
      .update({ last_tuning_date: nowIso().slice(0, 10), recommended_next_service_date: next, updated_at: nowIso() })
      .eq('id', a.piano_id)
  }

  return data
}

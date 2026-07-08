import { Resend } from 'resend'
import { db, nowIso } from './serverClient'
import { createNotification } from './notifications'
import { formatEatRange, formatEatDateTime, eatDaysUntil } from './kenyaTime'
import type { NptAppointmentRow, NptCustomerRow, NptPianoRow, OpsTeamMemberRow } from '@ocg/db'

// =============================================================================
// NPT appointment communications — the automated loop around every appointment:
//   on create   → confirmation email to the client + assignment notice to the
//                 technician (email + portal notification) + timeline log
//   cron (daily)→ reminders at T-3 days, T-1 day, and day-of for the client,
//                 T-1 day and day-of for the technician
// Every send is logged to npt_comm_logs, which doubles as the dedupe register —
// a given (appointment, kind) is never sent twice. All sends are best-effort:
// a missing RESEND_API_KEY never blocks scheduling.
// =============================================================================

const GOLD = '#b07a00'
const NAVY = '#1a1a2e'

function resend(): Resend | null {
  const key = process.env['RESEND_API_KEY']
  return key ? new Resend(key) : null
}
function fromAddress(): string {
  return process.env['OPS_EMAIL_FROM'] ?? 'ops@onecoregroup.com'
}

type CommKind =
  | 'confirmation' | 'reminder_3d' | 'reminder_1d' | 'reminder_day'
  | 'tech_assigned' | 'tech_reminder_1d' | 'tech_reminder_day'

interface ApptContext {
  appointment: NptAppointmentRow
  customer: NptCustomerRow | null
  piano: NptPianoRow | null
  technician: OpsTeamMemberRow | null
}

async function loadContext(appointmentId: string): Promise<ApptContext | null> {
  const supabase = db()
  const { data: appt } = await supabase.from('npt_appointments').select('*').eq('id', appointmentId).maybeSingle()
  if (!appt) return null
  const appointment = appt as NptAppointmentRow
  const [customer, piano, technician] = await Promise.all([
    appointment.customer_id
      ? supabase.from('npt_customers').select('*').eq('id', appointment.customer_id).maybeSingle().then((r) => r.data as NptCustomerRow | null)
      : null,
    appointment.piano_id
      ? supabase.from('npt_pianos').select('*').eq('id', appointment.piano_id).maybeSingle().then((r) => r.data as NptPianoRow | null)
      : null,
    appointment.technician_id
      ? supabase.from('ops_team_members').select('*').eq('id', appointment.technician_id).maybeSingle().then((r) => r.data as OpsTeamMemberRow | null)
      : null,
  ])
  return { appointment, customer, piano, technician }
}

async function alreadySent(appointmentId: string, kind: CommKind): Promise<boolean> {
  const { data } = await db()
    .from('npt_comm_logs')
    .select('id')
    .eq('appointment_id', appointmentId)
    .eq('kind', kind)
    .eq('status', 'sent')
    .limit(1)
  return Boolean(data?.length)
}

async function logComm(ctx: ApptContext, kind: CommKind, recipient: string, subject: string, status: 'sent' | 'failed' | 'skipped', detail = '') {
  await db().from('npt_comm_logs').insert({
    appointment_id: ctx.appointment.id,
    customer_id: ctx.appointment.customer_id,
    kind,
    channel: 'email',
    recipient,
    subject,
    status,
    detail,
  })
}

function pianoLabel(piano: NptPianoRow | null): string {
  if (!piano) return ''
  return [piano.make, piano.model, piano.piano_type].filter(Boolean).join(' ')
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function clientEmailHtml(ctx: ApptContext, heading: string, intro: string): string {
  const { appointment, piano, technician } = ctx
  const rows: [string, string][] = [
    ['When', formatEatRange(appointment.start_at, appointment.end_at) || 'To be confirmed'],
    ['Where', appointment.location || 'Your location on file'],
  ]
  if (piano) rows.push(['Piano', pianoLabel(piano)])
  if (technician) rows.push(['Technician', technician.name])
  const detailRows = rows
    .map(([k, v]) => `<tr><td style="padding:6px 12px;color:#888;font-size:13px;white-space:nowrap">${k}</td><td style="padding:6px 12px;font-size:14px;font-weight:600">${escapeHtml(v)}</td></tr>`)
    .join('')
  return `
  <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a2e">
    <div style="background:${NAVY};padding:20px 24px;border-radius:12px 12px 0 0">
      <span style="color:#fff;font-weight:700;font-size:18px">Nairobi Piano Technicians</span>
    </div>
    <div style="border:1px solid #eee;border-top:none;padding:24px;border-radius:0 0 12px 12px">
      <h1 style="font-size:19px;margin:0 0 6px">${escapeHtml(heading)}</h1>
      <p style="font-size:14px;line-height:1.6;color:#444;margin:0 0 16px">${escapeHtml(intro)}</p>
      <table style="border-collapse:collapse;background:#faf8f3;border-radius:10px;width:100%">${detailRows}</table>
      ${appointment.notes ? `<p style="font-size:13px;color:#666;margin:16px 0 0"><b>Notes:</b> ${escapeHtml(appointment.notes)}</p>` : ''}
      <p style="color:#aaa;font-size:11px;margin-top:20px">
        Need to reschedule? Reply to this email or call us and we will find a better time.
      </p>
    </div>
  </div>`
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const client = resend()
  if (!client || !to) return false
  try {
    await client.emails.send({ from: fromAddress(), to, subject, html })
    return true
  } catch {
    return false
  }
}

async function logTimeline(ctx: ApptContext, body: string) {
  await db().from('npt_timeline_events').insert({
    customer_id: ctx.appointment.customer_id,
    piano_id: ctx.appointment.piano_id,
    appointment_id: ctx.appointment.id,
    event_type: 'system',
    title: 'Automated communication',
    body,
    actor: 'system',
    occurred_at: nowIso(),
  })
}

/** Client confirmation + technician assignment notice for a NEW appointment.
 *  Fire-and-forget from the API route — never throws. */
export async function sendAppointmentCreatedComms(appointmentId: string): Promise<void> {
  try {
    const ctx = await loadContext(appointmentId)
    if (!ctx) return
    const { appointment, customer, technician } = ctx
    const when = formatEatRange(appointment.start_at, appointment.end_at)

    // Client confirmation
    if (customer?.email && customer.send_auto_reminders !== false && !(await alreadySent(appointmentId, 'confirmation'))) {
      const subject = `Appointment confirmed — ${appointment.title || 'Piano service'} · ${when}`
      const ok = await sendEmail(
        customer.email,
        subject,
        clientEmailHtml(ctx, `Your appointment is booked, ${customer.full_name.split(' ')[0]}`,
          'This confirms your piano service appointment with Nairobi Piano Technicians. The details are below — we will also remind you as the day approaches.'),
      )
      await logComm(ctx, 'confirmation', customer.email, subject, ok ? 'sent' : 'failed', ok ? '' : 'Resend unavailable or send failed')
      if (ok) await logTimeline(ctx, `Confirmation email sent to ${customer.email}.`)
    }

    // Technician assignment (email + portal notification)
    if (technician?.email && !(await alreadySent(appointmentId, 'tech_assigned'))) {
      const subject = `New appointment: ${appointment.title || 'Piano service'} · ${when}`
      const ok = await sendEmail(
        technician.email,
        subject,
        clientEmailHtml(ctx, `You have been scheduled, ${technician.name.split(' ')[0]}`,
          `A new appointment has been assigned to you${customer ? ` for ${customer.full_name}` : ''}. It also appears under My Tasks in your portal.`),
      )
      await logComm(ctx, 'tech_assigned', technician.email, subject, ok ? 'sent' : 'failed')
      await createNotification({
        recipient_email: technician.email,
        recipient_name: technician.name,
        kind: 'npt_appointment',
        title: `New appointment: ${appointment.title || 'Piano service'}`,
        body: `${when}${appointment.location ? ` · ${appointment.location}` : ''}${customer ? ` · ${customer.full_name}` : ''}`,
        href: '/my-tasks',
        metadata: { appointment_id: appointment.id },
      })
    }
  } catch {
    // Comms must never break scheduling.
  }
}

const CLIENT_REMINDERS: { kind: CommKind; days: number; heading: string; intro: string }[] = [
  { kind: 'reminder_3d', days: 3, heading: 'Your piano appointment is in 3 days', intro: 'A friendly reminder of your upcoming appointment with Nairobi Piano Technicians.' },
  { kind: 'reminder_1d', days: 1, heading: 'Your piano appointment is tomorrow', intro: 'A reminder that your appointment is tomorrow. Kindly ensure the piano is accessible.' },
  { kind: 'reminder_day', days: 0, heading: 'Your piano appointment is today', intro: 'Your technician is scheduled for today. See the details below.' },
]

const TECH_REMINDERS: { kind: CommKind; days: number }[] = [
  { kind: 'tech_reminder_1d', days: 1 },
  { kind: 'tech_reminder_day', days: 0 },
]

/**
 * Daily reminder sweep (Vercel cron). Looks at upcoming, uncancelled,
 * uncompleted appointments in the next 4 days and sends whichever client /
 * technician reminders are due today and not already logged.
 */
export async function runAppointmentReminders(): Promise<{ checked: number; sent: number }> {
  const supabase = db()
  const windowStart = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
  const windowEnd = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('npt_appointments')
    .select('*')
    .gte('start_at', windowStart)
    .lte('start_at', windowEnd)
    .neq('status', 'Completed')
    .neq('status', 'Cancelled')
  const appointments = (data as NptAppointmentRow[] | null) ?? []

  let sent = 0
  for (const appointment of appointments) {
    if (!appointment.start_at) continue
    const daysOut = eatDaysUntil(appointment.start_at)
    const ctx = await loadContext(appointment.id)
    if (!ctx) continue
    const when = formatEatRange(appointment.start_at, appointment.end_at)

    for (const r of CLIENT_REMINDERS) {
      if (daysOut !== r.days) continue
      const email = ctx.customer?.email
      if (!email || ctx.customer?.send_auto_reminders === false) continue
      if (await alreadySent(appointment.id, r.kind)) continue
      const subject = `Reminder — ${appointment.title || 'Piano service'} · ${when}`
      const ok = await sendEmail(email, subject, clientEmailHtml(ctx, r.heading, r.intro))
      await logComm(ctx, r.kind, email, subject, ok ? 'sent' : 'failed')
      if (ok) { sent++; await logTimeline(ctx, `${r.days === 0 ? 'Day-of' : `${r.days}-day`} reminder emailed to ${email}.`) }
    }

    for (const r of TECH_REMINDERS) {
      if (daysOut !== r.days) continue
      const tech = ctx.technician
      if (!tech?.email) continue
      if (await alreadySent(appointment.id, r.kind)) continue
      const label = r.days === 0 ? 'today' : 'tomorrow'
      const subject = `Reminder — you have an appointment ${label} · ${when}`
      const ok = await sendEmail(
        tech.email,
        subject,
        clientEmailHtml(ctx, `Appointment ${label}: ${appointment.title || 'Piano service'}`,
          `${ctx.customer ? `Client: ${ctx.customer.full_name}. ` : ''}Please confirm your availability and tools.`),
      )
      await logComm(ctx, r.kind, tech.email, subject, ok ? 'sent' : 'failed')
      await createNotification({
        recipient_email: tech.email,
        recipient_name: tech.name,
        kind: 'npt_reminder',
        title: `Appointment ${label}: ${appointment.title || 'Piano service'}`,
        body: `${when}${appointment.location ? ` · ${appointment.location}` : ''}`,
        href: '/my-tasks',
        metadata: { appointment_id: appointment.id },
      })
      if (ok) sent++
    }
  }
  return { checked: appointments.length, sent }
}

/** Reschedule notice when an appointment's time changes. */
export async function sendAppointmentRescheduledComms(appointmentId: string, previousStart: string | null): Promise<void> {
  try {
    const ctx = await loadContext(appointmentId)
    if (!ctx?.customer?.email || ctx.customer.send_auto_reminders === false) return
    const { appointment, customer } = ctx
    const email = ctx.customer.email
    if (!appointment.start_at || appointment.start_at === previousStart) return
    const subject = `Appointment updated — now ${formatEatRange(appointment.start_at, appointment.end_at)}`
    const ok = await sendEmail(
      email,
      subject,
      clientEmailHtml(ctx, 'Your appointment time has changed',
        `Your appointment${previousStart ? ` previously set for ${formatEatDateTime(previousStart)}` : ''} has been rescheduled. The new details are below.`),
    )
    if (ok) await logTimeline(ctx, `Reschedule notice emailed to ${customer.email}.`)
  } catch {
    // best-effort
  }
}

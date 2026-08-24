import { NextResponse, type NextRequest } from 'next/server'
import { sendMorningWorkBrief } from '@/lib/email'
import { listTeam } from '@/lib/team'
import { listTasks } from '@/lib/tasks'
import { isActiveStatus } from '@/lib/taskStatuses'
import { createNotification } from '@/lib/notifications'
import { occurrencesOn, overdueOccurrences, pendingReviews, type DutyOccurrence } from '@/lib/dutyOccurrences'
import { buildWorkBrief, limitSection, type BriefLine, type WorkBrief } from '@/lib/morningBrief'
import { isTaskClosed } from '@/lib/myWorkModel'
import { dutyOccurrenceKey } from '@/lib/myWork'
import { formatScheduleRange } from '@/lib/calendarTasks'
import { db, todayInEat } from '@/lib/serverClient'
import type { OpsTaskRow, NptAppointmentRow, OpsTeamMemberRow } from '@ocg/db'

/**
 * THE MORNING WORK BRIEF (§§18–21).
 *
 * One weekday email per person covering their whole day — Daily Duties,
 * Assigned Tasks, appointments, overdue work, and reviews reserved for them.
 * §18 forbids a second duty cron, so this extends the existing team-brief job
 * that vercel.json already schedules rather than adding one.
 *
 * Every source is read ONCE for the whole company and then bucketed per person
 * (§50 "avoid obvious N+1 morning-email queries"): duties are derived a fixed
 * number of times regardless of headcount, and tasks/appointments are single
 * queries. A hundred employees costs the same number of round-trips as one.
 */

/** How far back the overdue sweep looks. Bounded so it never walks history (§19). */
const OVERDUE_LOOKBACK_DAYS = 7

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-KE', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Nairobi',
  }) : ''

export async function GET(req: NextRequest) {
  // Fail closed: without a configured CRON_SECRET this endpoint stays locked
  // rather than becoming world-callable.
  const secret = process.env['CRON_SECRET']
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const baseUrl = (
    process.env['NEXT_PUBLIC_OPS_URL'] || process.env['OPS_OPS_BASE_URL'] || 'https://ops.onecoregroup.com'
  ).replace(/\/$/, '')
  const date = todayInEat()
  const team = await listTeam()

  const [dutiesToday, dutiesOverdue, tasks, appointments, reviews] = await Promise.all([
    occurrencesOn(date, { scope: { kind: 'all' } }),
    overdueOccurrences({ scope: { kind: 'all' }, date, lookbackDays: OVERDUE_LOOKBACK_DAYS }),
    listTasks({ activeOnly: true, limit: 5000 }),
    appointmentsOn(date),
    pendingReviews({ kind: 'all' }),
  ])

  const dutiesByMember = groupOccurrences(dutiesToday)
  const overdueByMember = groupOccurrences(dutiesOverdue)
  const tasksByName = groupTasks(tasks)
  const apptsByMember = groupAppointments(appointments)
  // §19: "Only include items that person is genuinely authorised to review."
  //
  // Named reviews are attributed; unnamed ones are not. Deciding eligibility for
  // an unnamed occurrence needs each member's permissions map, which is a
  // per-person lookup this job deliberately avoids — and being told to review
  // work you turn out not to be authorised for is worse than not being told.
  // Unnamed reviews still surface in the review queue for whoever can act.
  const reviewsByReviewer = new Map<string, BriefLine[]>()
  for (const r of reviews) {
    if (!r.reviewerId) continue
    const line: BriefLine = {
      key: `review:${r.log.id}`,
      title: r.duty?.title ?? 'Duty',
      detail: r.log.completed_by || r.log.duty_date,
    }
    reviewsByReviewer.set(r.reviewerId, [...(reviewsByReviewer.get(r.reviewerId) ?? []), line])
  }

  const results: Array<Record<string, unknown>> = []
  for (const member of team) {
    if (!member.email) continue
    const brief = briefFor(member, date, {
      dutiesByMember, overdueByMember, tasksByName, apptsByMember, reviewsByReviewer,
    })

    // §20: someone with nothing actionable gets no email. Preserving the
    // existing skip behaviour is the point — a daily "you have nothing" is how
    // a brief becomes noise people filter away.
    if (brief.isEmpty) {
      results.push({ member: member.name, email: member.email, sent: false, skipped: 'nothing actionable' })
      continue
    }

    const sent = await sendMorningWorkBrief({
      to: member.email,
      name: member.name.split(' ')[0] || member.name,
      headline: brief.headline,
      workUrl: `${baseUrl}/my-work`,
      sections: emailSections(brief),
    })

    // §21: the in-app notification represents the whole day, not tasks alone,
    // and links to My Work. Metadata stays to identifiers only — it is a
    // pointer, not a second copy of the work (§21).
    await createNotification({
      recipient_email: member.email,
      recipient_name: member.name,
      sender_name: 'Ops Hub',
      kind: 'morning_task_brief',
      title: `Morning work brief: ${brief.headline}`,
      body: [
        brief.counts.duties ? `${brief.counts.duties} daily duties` : '',
        brief.counts.tasks ? `${brief.counts.tasks} assigned tasks` : '',
        brief.counts.overdue ? `${brief.counts.overdue} overdue` : '',
        brief.counts.reviews ? `${brief.counts.reviews} awaiting your review` : '',
      ].filter(Boolean).join(' · '),
      href: '/my-work',
      metadata: { date, ...brief.counts },
    })

    results.push({
      member: member.name, email: member.email, sent,
      duties: brief.counts.duties, tasks: brief.counts.tasks,
      overdue: brief.counts.overdue, reviews: brief.counts.reviews,
    })
  }

  return NextResponse.json({
    ok: true,
    date,
    sent: results.filter((r) => r['sent']).length,
    skipped: results.filter((r) => !r['sent']).length,
    results,
  })
}

// ─── Per-person assembly ────────────────────────────────────────────────────

interface Buckets {
  dutiesByMember: Map<string, DutyOccurrence[]>
  overdueByMember: Map<string, DutyOccurrence[]>
  tasksByName: Map<string, OpsTaskRow[]>
  apptsByMember: Map<string, NptAppointmentRow[]>
  reviewsByReviewer: Map<string, BriefLine[]>
}

function briefFor(member: OpsTeamMemberRow, date: string, b: Buckets): WorkBrief {
  const myDuties = (b.dutiesByMember.get(member.id) ?? [])
    // §19: exclude duties already completed before the brief is generated.
    .filter((o) => o.status !== 'done' && o.status !== 'skipped')
  const myOverdueDuties = b.overdueByMember.get(member.id) ?? []
  const myTasks = (b.tasksByName.get(member.name.trim().toLowerCase()) ?? [])
    .filter((t) => !isTaskClosed(t.current_status) && isActiveStatus(t.current_status))

  // Overdue is about the DEADLINE. A task scheduled for a past day but not yet
  // due is simply work that slipped its slot, not late work.
  const overdueTasks = myTasks.filter((t) => t.target_date && t.target_date < date)
  const dueTasks = myTasks.filter((t) => !overdueTasks.includes(t))

  return buildWorkBrief({
    recipientName: member.name,
    recipientEmail: member.email ?? '',
    date,
    duties: myDuties.map(dutyLine),
    tasks: dueTasks.map(taskLine),
    appointments: (b.apptsByMember.get(member.id) ?? []).map((a) => ({
      key: `appointment:${a.id}`,
      title: a.title || 'Appointment',
      detail: time(a.start_at),
    })),
    overdue: [...myOverdueDuties.map(dutyLine), ...overdueTasks.map(taskLine)],
    reviews: b.reviewsByReviewer.get(member.id) ?? [],
  })
}

function dutyLine(o: DutyOccurrence): BriefLine {
  return {
    // The occurrence identity. Each brief section is already scoped to ONE
    // person, so (duty, date) identifies the occurrence and the assignee adds
    // nothing but a way for the two sides to disagree (§49).
    key: dutyOccurrenceKey(o.duty.id, o.date),
    title: o.duty.title,
    detail: o.dueAt ? `due ${time(o.dueAt)}` : o.date,
  }
}

function taskLine(t: OpsTaskRow): BriefLine {
  // §44: a scheduled task leads with its working window — "10:00–12:00" is what
  // the person needs at 07:00, not a task reference.
  const window = formatScheduleRange(t.scheduled_start_at, t.scheduled_end_at, t.scheduled_all_day)
  return {
    // A task materialised from a duty shares the duty's key so the pair
    // collapses to the richer duty entry (§43 "no duplicated Duty occurrence").
    key: t.duty_id && t.duty_date ? dutyOccurrenceKey(t.duty_id, t.duty_date) : `task:${t.task_id}`,
    title: t.task_name,
    detail: [
      window,
      t.task_id,
      t.priority !== 'Medium' ? t.priority : '',
      t.target_date ? `due ${t.target_date}` : '',
    ].filter(Boolean).join(' · '),
  }
}

/** The email's sections, in reading order, with empty ones dropped (§20). */
function emailSections(brief: WorkBrief) {
  return [
    { label: 'Daily duties', lines: brief.duties, tone: '#1a6b42' },
    { label: 'Assigned tasks', lines: brief.tasks, tone: '#1a1a2e' },
    { label: 'Appointments', lines: brief.appointments, tone: '#2c45a0' },
    { label: 'Overdue', lines: brief.overdue, tone: '#9a2a2a' },
    { label: 'Reviews awaiting you', lines: brief.reviews, tone: '#b07a00' },
  ]
    .filter((s) => s.lines.length > 0)
    .map((s) => {
      const { shown, more } = limitSection(s.lines)
      return {
        label: s.label,
        tone: s.tone,
        more,
        items: shown.map((l) => ({ title: l.title, detail: l.detail })),
      }
    })
}

// ─── Batched sources ────────────────────────────────────────────────────────

function groupOccurrences(occurrences: DutyOccurrence[]): Map<string, DutyOccurrence[]> {
  const map = new Map<string, DutyOccurrence[]>()
  for (const o of occurrences) {
    if (!o.assignee.id) continue
    map.set(o.assignee.id, [...(map.get(o.assignee.id) ?? []), o])
  }
  return map
}

/** Tasks keyed by assignee display name, lower-cased — how ops_tasks stores it. */
function groupTasks(tasks: OpsTaskRow[]): Map<string, OpsTaskRow[]> {
  const map = new Map<string, OpsTaskRow[]>()
  for (const t of tasks) {
    const key = (t.assigned_to ?? '').trim().toLowerCase()
    if (!key) continue
    map.set(key, [...(map.get(key) ?? []), t])
  }
  return map
}

function groupAppointments(rows: NptAppointmentRow[]): Map<string, NptAppointmentRow[]> {
  const map = new Map<string, NptAppointmentRow[]>()
  for (const a of rows) {
    if (!a.technician_id) continue
    map.set(a.technician_id, [...(map.get(a.technician_id) ?? []), a])
  }
  return map
}

/** Today's engagements for everyone, in one query. Africa/Nairobi is UTC+3. */
async function appointmentsOn(date: string): Promise<NptAppointmentRow[]> {
  const { data } = await db().from('npt_appointments').select('*')
    .gte('start_at', `${date}T00:00:00+03:00`)
    .lte('start_at', `${date}T23:59:59+03:00`)
    .neq('status', 'Completed')
    .neq('status', 'Cancelled')
    .order('start_at', { ascending: true })
    .limit(500)
  return (data as NptAppointmentRow[] | null) ?? []
}

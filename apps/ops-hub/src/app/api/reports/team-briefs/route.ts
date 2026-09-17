import { NextResponse, type NextRequest } from 'next/server'
import { sendMorningWorkBrief } from '@/lib/email'
import { listTeam } from '@/lib/team'
import { listTasks } from '@/lib/tasks'
import { createNotification } from '@/lib/notifications'
import { occurrencesOn, overdueOccurrences, pendingReviews, type DutyOccurrence } from '@/lib/dutyOccurrences'
import { orderChecklist, type ChecklistItem } from '@/lib/dutyDetail'
import type { BriefLine } from '@/lib/morningBrief'
import { briefCounts, briefFor, briefHeadline, emailSections } from '@/lib/workBrief'
import { db, todayInEat } from '@/lib/serverClient'
import type { OpsTaskRow, NptAppointmentRow, OcgDutyChecklistItemRow } from '@ocg/db'

/**
 * THE MORNING WORK BRIEF (§§18–21).
 *
 * One weekday email per person covering their whole day — each Daily Duty broken
 * down into its full checklist, every Assigned Task not yet completed,
 * appointments, duties missed on earlier days, and reviews reserved for them.
 * §18 forbids a second duty cron, so this extends the existing team-brief job
 * that vercel.json already schedules rather than adding one.
 *
 * Every source is read ONCE for the whole company and then bucketed per person
 * (§50 "avoid obvious N+1 morning-email queries"): duties are derived a fixed
 * number of times regardless of headcount, checklists are one query, and
 * tasks/appointments are single queries. Assembly lives in lib/workBrief.ts.
 */

/** How far back the overdue sweep looks. Bounded so it never walks history (§19). */
const OVERDUE_LOOKBACK_DAYS = 7

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
  const checklistByDuty = await checklistsFor([...new Set(dutiesToday.map((o) => o.duty.id))])

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

  const buckets = {
    dutiesByMember: groupOccurrences(dutiesToday),
    overdueByMember: groupOccurrences(dutiesOverdue),
    tasksByName: groupTasks(tasks),
    apptsByMember: groupAppointments(appointments),
    reviewsByReviewer,
    checklistByDuty,
  }
  const dateLabel = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })

  const results: Array<Record<string, unknown>> = []
  for (const member of team) {
    if (!member.email) continue
    const brief = briefFor(member, date, buckets)

    // §20: someone with nothing actionable gets no email. Preserving the
    // existing skip behaviour is the point — a daily "you have nothing" is how
    // a brief becomes noise people filter away.
    if (brief.isEmpty) {
      results.push({ member: member.name, email: member.email, sent: false, skipped: 'nothing actionable' })
      continue
    }

    const headline = briefHeadline(brief)
    const counts = briefCounts(brief)
    const sent = await sendMorningWorkBrief({
      to: member.email,
      name: member.name.split(' ')[0] || member.name,
      dateLabel,
      headline,
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
      title: `Morning work brief: ${headline}`,
      body: [
        counts.duties ? `${counts.duties} daily ${counts.duties === 1 ? 'duty' : 'duties'}` : '',
        counts.tasks ? `${counts.tasks} open assigned ${counts.tasks === 1 ? 'task' : 'tasks'}` : '',
        counts.overdueTasks ? `${counts.overdueTasks} overdue` : '',
        counts.missedDuties ? `${counts.missedDuties} not recorded earlier` : '',
        counts.reviews ? `${counts.reviews} awaiting your review` : '',
      ].filter(Boolean).join(' · '),
      href: '/my-work',
      metadata: { date, ...counts },
    })

    results.push({ member: member.name, email: member.email, sent, ...counts })
  }

  return NextResponse.json({
    ok: true,
    date,
    sent: results.filter((r) => r['sent']).length,
    skipped: results.filter((r) => !r['sent']).length,
    results,
  })
}

// ─── Batched sources ────────────────────────────────────────────────────────

/** Every active checklist item for today's duties, in position order — one query. */
async function checklistsFor(dutyIds: string[]): Promise<Map<string, ChecklistItem[]>> {
  const byDuty = new Map<string, ChecklistItem[]>()
  if (dutyIds.length === 0) return byDuty
  const { data } = await db().from('ocg_duty_checklist_items').select('*')
    .in('duty_id', dutyIds).eq('active', true).order('position', { ascending: true })
  for (const row of orderChecklist((data as OcgDutyChecklistItemRow[] | null) ?? [])) {
    byDuty.set(row.duty_id, [...(byDuty.get(row.duty_id) ?? []), {
      id: row.id, label: row.label, hint: row.hint ?? '', required: row.required !== false, position: row.position ?? 0,
    }])
  }
  return byDuty
}

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

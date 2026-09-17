// Assembly of one person's Morning Work Brief (§§18–21). Pure — the cron route
// loads everything once for the whole company and hands the buckets in here, so
// this can be unit-tested (workBrief.test.ts) without a database or a mailer.
//
// What the brief must carry, in order:
//   1. Daily duties for today — each with its WHOLE checklist, item by item, so
//      the email alone tells the person what the duty involves.
//   2. Every assigned task that is not yet completed, overdue ones first.
//   3. Appointments, missed duties from earlier days, reviews reserved for them.

import {
  buildWorkBrief, briefShortDate, groupMissedDuties, limitSection, orderOpenTasks,
  BRIEF_SECTION_LIMIT, BRIEF_TASK_LIMIT,
  type BriefLine, type WorkBrief,
} from './morningBrief'
import { dutyOccurrenceKey } from './myWork'
import { isTaskClosed } from './myWorkModel'
import { formatScheduleRange } from './calendarTasks'
import { describeRecurrence } from './recurrence'
import type { DutyOccurrence } from './dutyOccurrences'
import type { ChecklistItem } from './dutyDetail'
import type { MorningBriefParams } from './email'
import type { NptAppointmentRow, OpsTaskRow, OpsTeamMemberRow } from '@ocg/db'

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-KE', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Nairobi',
  }) : ''

export interface BriefBuckets {
  dutiesByMember: Map<string, DutyOccurrence[]>
  overdueByMember: Map<string, DutyOccurrence[]>
  tasksByName: Map<string, OpsTaskRow[]>
  apptsByMember: Map<string, NptAppointmentRow[]>
  reviewsByReviewer: Map<string, BriefLine[]>
  /** Active checklist items per duty definition, already in position order. */
  checklistByDuty: Map<string, ChecklistItem[]>
}

/** Today's duty, broken down: its note, and every checklist item with its hint. */
export function dutyLine(o: DutyOccurrence, checklist: ChecklistItem[] = []): BriefLine {
  const done = Math.min(o.checklistDone, checklist.length)
  return {
    // The occurrence identity. Each brief section is already scoped to ONE
    // person, so (duty, date) identifies the occurrence (§49).
    key: dutyOccurrenceKey(o.duty.id, o.date),
    title: o.duty.title,
    detail: [
      describeRecurrence(o.duty),
      o.dueAt ? `due ${time(o.dueAt)}` : '',
      checklist.length === 0 ? '' : done > 0
        ? `${done} of ${checklist.length} checklist items done`
        : `${checklist.length} checklist ${checklist.length === 1 ? 'item' : 'items'}`,
    ].filter(Boolean).join(' · '),
    description: o.duty.description?.trim() || undefined,
    // A duty without a checklist is described by its instructions instead (§6).
    instructions: checklist.length === 0 ? (o.duty.instructions?.trim() || undefined) : undefined,
    checklist: checklist.map((item) => ({ label: item.label, hint: item.hint, required: item.required })),
  }
}

/** An unrecorded occurrence from an earlier day; grouped per duty in the email. */
export function missedDutyLine(o: DutyOccurrence): BriefLine {
  return {
    key: dutyOccurrenceKey(o.duty.id, o.date),
    title: o.duty.title,
    detail: o.date,
    group: `missed:${o.duty.id}`,
    date: o.date,
  }
}

export function taskLine(t: OpsTaskRow, today: string): BriefLine {
  // §44: a scheduled task leads with its working window.
  const window = formatScheduleRange(t.scheduled_start_at, t.scheduled_end_at, t.scheduled_all_day)
  const overdue = !!t.target_date && t.target_date < today
  return {
    // A task materialised FROM a duty shares the duty's key so the pair
    // collapses to the richer duty entry (§43).
    key: t.duty_id && t.duty_date ? dutyOccurrenceKey(t.duty_id, t.duty_date) : `task:${t.task_id}`,
    title: t.task_name,
    detail: [
      window,
      t.task_id,
      t.current_status,
      t.priority && t.priority !== 'Medium' ? `${t.priority} priority` : '',
      t.target_date ? `due ${briefShortDate(t.target_date)}` : 'no deadline',
    ].filter(Boolean).join(' · '),
    flag: overdue ? 'overdue' : t.current_status === 'Blocked' ? 'blocked' : undefined,
  }
}

export function briefFor(member: OpsTeamMemberRow, date: string, b: BriefBuckets): WorkBrief {
  const myDuties = (b.dutiesByMember.get(member.id) ?? [])
    // §19: exclude duties already settled before the brief is generated.
    .filter((o) => o.status !== 'done' && o.status !== 'skipped')
  const myMissed = b.overdueByMember.get(member.id) ?? []
  // Every assigned task that is not completed — blocked and awaiting-review work
  // included, because it is still theirs — overdue first.
  const myTasks = orderOpenTasks(
    (b.tasksByName.get(member.name.trim().toLowerCase()) ?? []).filter((t) => !isTaskClosed(t.current_status)),
    date,
  )

  return buildWorkBrief({
    recipientName: member.name,
    recipientEmail: member.email ?? '',
    date,
    duties: myDuties.map((o) => dutyLine(o, b.checklistByDuty.get(o.duty.id) ?? [])),
    tasks: myTasks.map((t) => taskLine(t, date)),
    appointments: (b.apptsByMember.get(member.id) ?? []).map((a) => ({
      key: `appointment:${a.id}`,
      title: a.title || 'Appointment',
      detail: time(a.start_at),
    })),
    overdue: myMissed.map(missedDutyLine),
    reviews: b.reviewsByReviewer.get(member.id) ?? [],
  })
}

/** Counts as the reader sees them: missed duties once per duty, not per day. */
export function briefCounts(brief: WorkBrief) {
  return {
    duties: brief.duties.length,
    tasks: brief.tasks.length,
    overdueTasks: brief.tasks.filter((l) => l.flag === 'overdue').length,
    missedDuties: groupMissedDuties(brief.overdue).length,
    appointments: brief.appointments.length,
    reviews: brief.reviews.length,
  }
}

/** Subject line and notification title: "2 duties · 5 open tasks (1 overdue)". */
export function briefHeadline(brief: WorkBrief): string {
  const c = briefCounts(brief)
  const parts: string[] = []
  if (c.duties) parts.push(`${c.duties} ${c.duties === 1 ? 'duty' : 'duties'}`)
  if (c.tasks) parts.push(`${c.tasks} open ${c.tasks === 1 ? 'task' : 'tasks'}${c.overdueTasks ? ` (${c.overdueTasks} overdue)` : ''}`)
  if (c.missedDuties) parts.push(`${c.missedDuties} ${c.missedDuties === 1 ? 'duty' : 'duties'} not recorded`)
  if (c.appointments) parts.push(`${c.appointments} ${c.appointments === 1 ? 'appointment' : 'appointments'}`)
  if (c.reviews) parts.push(`${c.reviews} to review`)
  return parts.length > 0 ? parts.join(' · ') : 'Nothing outstanding'
}

/** The email's sections, in reading order, with empty ones dropped (§20). */
export function emailSections(brief: WorkBrief): MorningBriefParams['sections'] {
  const overdueTasks = brief.tasks.filter((l) => l.flag === 'overdue').length
  return [
    {
      label: 'Daily duties',
      note: 'Your recurring responsibilities today, with the full checklist for each.',
      lines: brief.duties, tone: '#1a6b42', limit: Number.POSITIVE_INFINITY,
    },
    {
      label: 'Assigned tasks not yet completed',
      note: overdueTasks > 0
        ? `${overdueTasks} past ${overdueTasks === 1 ? 'its' : 'their'} deadline, listed first.`
        : 'Everything assigned to you that is still open.',
      lines: brief.tasks, tone: '#1a1a2e', limit: BRIEF_TASK_LIMIT,
    },
    { label: 'Appointments', lines: brief.appointments, tone: '#2c45a0', limit: BRIEF_SECTION_LIMIT },
    {
      label: 'Duties not recorded on earlier days',
      note: 'Record them in My Work, or mark them not done.',
      lines: groupMissedDuties(brief.overdue), tone: '#9a2a2a', limit: BRIEF_SECTION_LIMIT,
    },
    { label: 'Reviews awaiting you', lines: brief.reviews, tone: '#b07a00', limit: BRIEF_SECTION_LIMIT },
  ]
    .filter((s) => s.lines.length > 0)
    .map((s) => {
      const { shown, more } = limitSection(s.lines, s.limit)
      return {
        label: s.label,
        note: s.note,
        tone: s.tone,
        more,
        items: shown.map((l) => ({
          title: l.title,
          detail: l.detail,
          description: l.description,
          instructions: l.instructions,
          checklist: l.checklist,
          flag: l.flag,
        })),
      }
    })
}

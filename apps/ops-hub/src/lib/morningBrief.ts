// The morning brief (§4). Pure assembly — unit-tested in morningBrief.test.ts.
//
// §4's governing constraint: "Daily duties should be incorporated into the
// existing morning task brief. Do not create a completely separate and
// repetitive email stream unless operationally necessary." and "Avoid sending
// multiple emails for the same task occurrence."
//
// So this builds ONE brief per person per day, deduplicated by occurrence
// identity, from the existing team-brief route.

export type BriefItemType = 'task' | 'duty' | 'inspection' | 'form' | 'approval' | 'meeting'

export interface BriefItem {
  /** Stable occurrence identity — the dedupe key. */
  key: string
  type: BriefItemType
  title: string
  reference: string
  dueDate: string
  dueTime: string | null
  priority: string
  overdue: boolean
  /** Set for duty occurrences so the brief can label them as recurring (§2). */
  recurring: boolean
  checklistTotal: number
  requiresNote: boolean
  requiresEvidence: boolean
  requiresApproval: boolean
  href: string
}

export interface PersonalBrief {
  recipientName: string
  recipientEmail: string
  date: string
  dueToday: BriefItem[]
  overdue: BriefItem[]
  counts: {
    tasksToday: number
    dutiesToday: number
    overdueTasks: number
    overdueDuties: number
    total: number
  }
  isEmpty: boolean
}

/**
 * §4: "Visually distinguish: normal task, daily duty, inspection, form
 * submission, approval." One label per type, used by both the email and the UI.
 */
export const BRIEF_TYPE_LABELS: Record<BriefItemType, string> = {
  task: 'Task',
  duty: 'Daily duty',
  inspection: 'Inspection',
  form: 'Form submission',
  approval: 'Approval',
  meeting: 'Meeting',
}

export const BRIEF_TYPE_TONES: Record<BriefItemType, string> = {
  task: '#1a1a2e',
  duty: '#1a6b42',
  inspection: '#b07a00',
  form: '#2c45a0',
  approval: '#9a2a2a',
  meeting: '#2a6a2a',
}

/** Classify a duty occurrence into the brief's visual vocabulary. */
export function briefTypeForDuty(dutyKind: string, requiresApproval: boolean): BriefItemType {
  if (dutyKind === 'inspection') return 'inspection'
  if (dutyKind === 'form') return 'form'
  if (requiresApproval) return 'approval'
  return 'duty'
}

/**
 * Deduplicate by occurrence key.
 *
 * §2: "Do not let the same occurrence appear as two separate underlying tasks
 * merely because it is displayed in more than one place." A duty that has ALSO
 * been materialised into ops_tasks would otherwise arrive twice — once from the
 * task feed, once from the duty feed. The duty entry wins, because it carries
 * the recurrence identity and the checklist.
 */
export function dedupeBriefItems(items: BriefItem[]): BriefItem[] {
  const byKey = new Map<string, BriefItem>()
  for (const item of items) {
    const existing = byKey.get(item.key)
    if (!existing) { byKey.set(item.key, item); continue }
    // Prefer the richer, recurrence-aware entry.
    if (!existing.recurring && item.recurring) byKey.set(item.key, item)
  }
  return [...byKey.values()]
}

const PRIORITY_RANK: Record<string, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 }

/** Overdue first, then priority, then due time, then title. */
export function sortBriefItems(items: BriefItem[]): BriefItem[] {
  return [...items].sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
    const pr = (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2)
    if (pr !== 0) return pr
    const at = a.dueTime ?? '99:99'
    const bt = b.dueTime ?? '99:99'
    if (at !== bt) return at.localeCompare(bt)
    return a.title.localeCompare(b.title)
  })
}

export function buildPersonalBrief(input: {
  recipientName: string
  recipientEmail: string
  date: string
  items: BriefItem[]
}): PersonalBrief {
  const items = dedupeBriefItems(input.items)
  const overdue = sortBriefItems(items.filter((i) => i.overdue))
  const dueToday = sortBriefItems(items.filter((i) => !i.overdue))
  const isDuty = (i: BriefItem) => i.type !== 'task' && i.type !== 'meeting'

  return {
    recipientName: input.recipientName,
    recipientEmail: input.recipientEmail,
    date: input.date,
    dueToday,
    overdue,
    counts: {
      tasksToday: dueToday.filter((i) => i.type === 'task').length,
      dutiesToday: dueToday.filter(isDuty).length,
      overdueTasks: overdue.filter((i) => i.type === 'task').length,
      overdueDuties: overdue.filter(isDuty).length,
      total: items.length,
    },
    // §4: nothing to say means no email. Sending an empty brief every morning
    // is exactly the repetitive stream the brief warns against.
    isEmpty: items.length === 0,
  }
}

// ─── Manager brief (§4 "Manager morning brief") ─────────────────────────────

export interface ManagerBriefInput {
  managerName: string
  managerEmail: string
  date: string
  teamDutiesDueToday: number
  teamDutiesMissedYesterday: Array<{ employee: string; duty: string }>
  criticalOverdue: Array<{ reference: string; title: string; assignee: string; daysOverdue: number }>
  escalatedInspections: Array<{ employee: string; duty: string; detail: string }>
  attendanceExceptions: Array<{ employee: string; detail: string }>
  inventoryAlerts: Array<{ item: string; location: string; usable: number; reorderLevel: number }>
  pendingReviews: number
}

export interface ManagerBrief extends ManagerBriefInput {
  isEmpty: boolean
  headline: string
}

/**
 * The manager's brief. Empty sections are still counted so `isEmpty` is honest:
 * a quiet morning produces no email rather than a page of zeros.
 *
 * Permission and brand scoping are the CALLER's job — this only assembles what
 * it is given, so a scoping bug cannot be hidden inside formatting.
 */
export function buildManagerBrief(input: ManagerBriefInput): ManagerBrief {
  const signals =
    input.teamDutiesMissedYesterday.length +
    input.criticalOverdue.length +
    input.escalatedInspections.length +
    input.attendanceExceptions.length +
    input.inventoryAlerts.length +
    input.pendingReviews

  const parts: string[] = []
  if (input.criticalOverdue.length) parts.push(`${input.criticalOverdue.length} critical overdue`)
  if (input.teamDutiesMissedYesterday.length) parts.push(`${input.teamDutiesMissedYesterday.length} duties missed yesterday`)
  if (input.attendanceExceptions.length) parts.push(`${input.attendanceExceptions.length} attendance exceptions`)
  if (input.inventoryAlerts.length) parts.push(`${input.inventoryAlerts.length} stock alerts`)
  if (input.pendingReviews) parts.push(`${input.pendingReviews} awaiting review`)

  return {
    ...input,
    isEmpty: signals === 0,
    headline: parts.length > 0 ? parts.join(' · ') : 'Nothing needing attention',
  }
}

// ─── Send-once bookkeeping (§4) ─────────────────────────────────────────────

/**
 * §4: "Avoid sending multiple emails for the same task occurrence."
 * Returns the occurrence keys that have NOT already been notified today, so a
 * re-run of the brief job cannot re-notify the same work.
 */
export function unnotifiedKeys(items: BriefItem[], alreadyNotified: string[]): string[] {
  const seen = new Set(alreadyNotified)
  return items.map((i) => i.key).filter((k) => !seen.has(k))
}

/**
 * §4's one-time duty assignment email: sent when a recurring duty is FIRST
 * assigned, guarded by a stored timestamp so editing the template later cannot
 * re-trigger it.
 */
export function shouldSendAssignmentEmail(duty: {
  assignment_email_sent_at?: string | null
  assignee_id?: string | null
  active?: boolean
  paused?: boolean
}): boolean {
  if (duty.active === false || duty.paused === true) return false
  if (!duty.assignee_id) return false      // nobody to send to
  return !duty.assignment_email_sent_at
}

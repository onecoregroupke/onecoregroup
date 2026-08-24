// What one employee has to do today (§§5–10). Pure — no I/O — so the page, the
// morning brief and the tests classify work identically.
//
// The governing constraint is §2: Duties and Assigned Tasks are DIFFERENT
// records and stay different. Nothing here merges them into a third kind of
// work. It composes a VIEW over two record types and keeps the type tag on
// every item, so the person can read their day in one place without the system
// pretending a recurring responsibility and a one-off instruction are the same
// thing.

/** The two kinds of company work, never flattened into one. */
export type WorkKind = 'duty' | 'task'

export const WORK_KIND_LABELS: Record<WorkKind, string> = {
  duty: 'Duty',
  task: 'Task',
}

/** Where an item belongs in the Today view. */
export type WorkSection = 'overdue' | 'today' | 'completed'

/**
 * The minimum an item must expose to be sorted and bucketed. Deliberately thin:
 * the rich Duty payload and the full task row travel separately to their own
 * renderers, so nothing here can become a lossy re-modelling of either.
 */
export interface WorkItem {
  /** Stable occurrence identity. Duty: duty:date:person. Task: the TASK-xxxx id. */
  key: string
  kind: WorkKind
  title: string
  /** YYYY-MM-DD. Empty when the work carries no date at all. */
  dueDate: string
  /** ISO instant when the item has a time of day, else null. */
  dueAt: string | null
  priority: string
  /** done | skipped | pending for duties; the task status for tasks. */
  status: string
  overdue: boolean
}

const PRIORITY_RANK: Record<string, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 }

/** Duty statuses that mean the person has responded to the occurrence. */
export function isDutySettled(status: string): boolean {
  return status === 'done' || status === 'skipped'
}

/** Task statuses that mean the task is off the person's plate. */
export function isTaskClosed(status: string): boolean {
  return status === 'Completed' || status === 'Cancelled'
}

export function isSettled(item: Pick<WorkItem, 'kind' | 'status'>): boolean {
  return item.kind === 'duty' ? isDutySettled(item.status) : isTaskClosed(item.status)
}

/**
 * Whether an item is late.
 *
 * A settled item is never overdue — finishing something late does not leave it
 * outstanding. A dated item is overdue once its date has passed; an item with a
 * due INSTANT is overdue once that instant has passed, which is how a duty due
 * at 08:00 becomes overdue during the day rather than only at midnight.
 */
export function isOverdue(
  item: Pick<WorkItem, 'kind' | 'status' | 'dueDate' | 'dueAt'>,
  today: string,
  nowIso?: string,
): boolean {
  if (isSettled(item)) return false
  if (item.dueAt) {
    const due = Date.parse(item.dueAt)
    const now = Date.parse(nowIso ?? `${today}T23:59:59Z`)
    if (Number.isFinite(due) && Number.isFinite(now)) return now > due
  }
  if (!item.dueDate) return false
  return item.dueDate < today
}

/** Overdue first, then priority, then time of day, then title. */
export function sortWork<T extends WorkItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
    const pr = (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2)
    if (pr !== 0) return pr
    // Work with a set time comes before work due "sometime today". A sentinel
    // string would depend on locale collation, so the null case is explicit.
    if (a.dueAt && b.dueAt && a.dueAt !== b.dueAt) return a.dueAt < b.dueAt ? -1 : 1
    if (a.dueAt && !b.dueAt) return -1
    if (!a.dueAt && b.dueAt) return 1
    return a.title.localeCompare(b.title)
  })
}

/**
 * §2: "Do not let the same occurrence appear as two separate underlying tasks
 * merely because it is displayed in more than one place."
 *
 * A duty that has ALSO been materialised into ops_tasks (migration 057 sets
 * duty_id on such a task) would otherwise show twice. The duty entry wins: it
 * carries the recurrence identity, the checklist and the review state.
 */
export function dedupeWork<T extends WorkItem>(items: T[]): T[] {
  const byKey = new Map<string, T>()
  for (const item of items) {
    const existing = byKey.get(item.key)
    if (!existing) { byKey.set(item.key, item); continue }
    if (existing.kind === 'task' && item.kind === 'duty') byKey.set(item.key, item)
  }
  return [...byKey.values()]
}

export interface TodayBuckets<T extends WorkItem> {
  overdue: T[]
  duties: T[]
  tasks: T[]
  counts: {
    overdue: number
    dutiesOutstanding: number
    tasksOpen: number
    dutiesDone: number
    total: number
  }
}

/**
 * The Today view (§6): Overdue, then Daily Duties, then Assigned Tasks.
 *
 * An overdue item appears in Overdue ONLY — repeating it lower down is how a
 * person loses track of what is actually late. Completed duties stay in the
 * Daily Duties section (ticked), because a duty list that hides what you already
 * did reads as though the day never started.
 */
export function buildToday<T extends WorkItem>(items: T[], today: string, nowIso?: string): TodayBuckets<T> {
  const marked = dedupeWork(items).map((i) => ({ ...i, overdue: isOverdue(i, today, nowIso) }))
  const overdue = sortWork(marked.filter((i) => i.overdue))
  const rest = marked.filter((i) => !i.overdue)

  const duties = sortWork(rest.filter((i) => i.kind === 'duty'))
  const tasks = sortWork(rest.filter((i) => i.kind === 'task' && !isTaskClosed(i.status)))

  return {
    overdue,
    duties,
    tasks,
    counts: {
      overdue: overdue.length,
      dutiesOutstanding: duties.filter((i) => !isDutySettled(i.status)).length,
      tasksOpen: tasks.length,
      dutiesDone: duties.filter((i) => i.status === 'done').length,
      total: overdue.length + duties.length + tasks.length,
    },
  }
}

/** The Completed tab (§10) — recent finished work of both kinds, newest first. */
export function buildCompleted<T extends WorkItem>(items: T[], limit = 60): T[] {
  return dedupeWork(items)
    .filter((i) => isSettled(i))
    .sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || '') || a.title.localeCompare(b.title))
    .slice(0, limit)
}

export const MY_WORK_TABS = ['today', 'duties', 'tasks', 'completed'] as const
export type MyWorkTab = (typeof MY_WORK_TABS)[number]

/** Parse ?tab= defensively — an unknown value lands on Today, never on nothing. */
export function parseTab(value: string | null | undefined): MyWorkTab {
  const v = (value ?? '').toLowerCase()
  return (MY_WORK_TABS as readonly string[]).includes(v) ? (v as MyWorkTab) : 'today'
}

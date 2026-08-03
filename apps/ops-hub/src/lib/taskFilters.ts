// Task list filtering — the single shared shape used by the API route, the
// server pages, and the oc-ops CLI, plus a PURE mapping from a friendly "view"
// (Overdue / Due today / …) to concrete filters. Kept free of any DB/clock
// import so it is deterministic and unit-testable (see taskFilters.test.ts).

export interface TaskFilter {
  brandId?: string
  /** Restrict to these brand ids (brand-manager scope). Applied on top of brandId. */
  brandIds?: string[]
  projectId?: string
  clientId?: string
  /** Exact single status. */
  status?: string
  /** Any-of status set (used by the grouped views, e.g. Awaiting review). */
  statusIn?: string[]
  /** Exact task category (Finance, Operations, …). THE fix for the finance filter. */
  category?: string
  priority?: string
  priorityIn?: string[]
  assignedTo?: string
  /** target_date strictly before (overdue). */
  dueBefore?: string
  dueOnOrAfter?: string
  dueOnOrBefore?: string
  /** Only rows that actually carry a due date (target_date <> ''). */
  hasDueDate?: boolean
  agentEligibleOnly?: boolean
  activeOnly?: boolean
  limit?: number
}

/** Quick views surfaced as filter chips on the Tasks page. */
export const TASK_VIEWS = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'due-today', label: 'Due today' },
  { value: 'due-week', label: 'Due this week' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'awaiting-review', label: 'Awaiting review' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'high-priority', label: 'High priority' },
  { value: 'completed', label: 'Completed' },
] as const

export type TaskView = (typeof TASK_VIEWS)[number]['value']

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Map a friendly view to concrete task filters, relative to `todayISO`
 * (a YYYY-MM-DD string). Pure: no DB, no `Date.now()` — the caller supplies
 * today, so the result is fully testable and timezone-correct (EAT is passed in).
 * Unknown/empty view → no extra constraints.
 */
export function taskViewToFilter(view: string | undefined | null, todayISO: string): Partial<TaskFilter> {
  switch (view) {
    case 'overdue':         return { dueBefore: todayISO, hasDueDate: true, activeOnly: true }
    case 'due-today':       return { dueOnOrAfter: todayISO, dueOnOrBefore: todayISO, hasDueDate: true }
    case 'due-week':        return { dueOnOrAfter: todayISO, dueOnOrBefore: addDaysISO(todayISO, 6), hasDueDate: true }
    case 'upcoming':        return { dueOnOrAfter: todayISO, hasDueDate: true }
    case 'in-progress':     return { statusIn: ['Ongoing'] }
    case 'awaiting-review': return { statusIn: ['AI Draft Ready', 'Edit Requested'] }
    case 'blocked':         return { statusIn: ['Blocked'] }
    case 'high-priority':   return { priorityIn: ['High', 'Urgent'] }
    case 'completed':       return { statusIn: ['Completed'] }
    default:                return {}
  }
}

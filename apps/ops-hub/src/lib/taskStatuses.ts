// Task lifecycle, shared by the UI, the API, and the oc-ops CLI.
//
// AI delivery track (unchanged):
//   Not Started → Ongoing → AI Draft Ready → (Approved | Edit Requested) → Completed
//
// Human review track (§13, migration 057) — only entered when a task sets
// requires_approval, so every existing task keeps its current behaviour:
//   Ongoing → Submitted → Under Review → (Completed | Reopened)
//
// plus the aside states Blocked, Partially Completed and Cancelled.

export const TASK_STATUSES = [
  'Not Started',
  'Ongoing',
  'AI Draft Ready',
  'Edit Requested',
  'Approved',
  'Submitted',
  'Under Review',
  'Reopened',
  'Completed',
  'Blocked',
  'Partially Completed',
  'Cancelled',
] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

/** Statuses that mean "the assignee says the work is done, a manager has not
 *  yet agreed". These are what a review queue is built from. */
export const REVIEW_PENDING_STATUSES = ['Submitted', 'Under Review'] as const

export function isAwaitingReview(status: string): boolean {
  return (REVIEW_PENDING_STATUSES as readonly string[]).includes(status)
}

export const TASK_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export const TASK_CATEGORIES = [
  'Operations',
  'Marketing',
  'Production',
  'Finance',
  'Governance',
  'Executive',
] as const
export type TaskCategory = (typeof TASK_CATEGORIES)[number]

export function isTerminalStatus(status: string): boolean {
  return status === 'Completed' || status === 'Cancelled'
}

export function isActiveStatus(status: string): boolean {
  return !isTerminalStatus(status) && status !== 'Blocked'
}

const STATUS_TONE: Record<string, string> = {
  'Not Started': 'bg-gray-100 text-gray-600',
  Ongoing: 'bg-blue-50 text-blue-700',
  'AI Draft Ready': 'bg-amber-50 text-amber-700',
  'Edit Requested': 'bg-orange-50 text-orange-700',
  Approved: 'bg-emerald-50 text-emerald-700',
  Submitted: 'bg-indigo-50 text-indigo-700',
  'Under Review': 'bg-violet-50 text-violet-700',
  Reopened: 'bg-rose-50 text-rose-700',
  Completed: 'bg-green-100 text-green-700',
  Blocked: 'bg-red-50 text-red-700',
  'Partially Completed': 'bg-yellow-50 text-yellow-700',
  Cancelled: 'bg-gray-100 text-gray-400 line-through',
}

export function statusTone(status: string): string {
  return STATUS_TONE[status] ?? 'bg-gray-100 text-gray-600'
}

const PRIORITY_TONE: Record<string, string> = {
  Low: 'bg-gray-100 text-gray-500',
  Medium: 'bg-sky-50 text-sky-700',
  High: 'bg-orange-50 text-orange-700',
  Urgent: 'bg-red-100 text-red-700',
}

export function priorityTone(priority: string): string {
  return PRIORITY_TONE[priority] ?? 'bg-gray-100 text-gray-500'
}

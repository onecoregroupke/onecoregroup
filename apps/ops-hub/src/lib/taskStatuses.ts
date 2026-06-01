// Task lifecycle, shared by the UI, the API, and the oc-ops CLI.
// Not Started → Ongoing → AI Draft Ready → (Approved | Edit Requested) → Completed
// plus the terminal/aside states Blocked and Partially Completed.

export const TASK_STATUSES = [
  'Not Started',
  'Ongoing',
  'AI Draft Ready',
  'Edit Requested',
  'Approved',
  'Completed',
  'Blocked',
  'Partially Completed',
] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

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
  return status === 'Completed'
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
  Completed: 'bg-green-100 text-green-700',
  Blocked: 'bg-red-50 text-red-700',
  'Partially Completed': 'bg-yellow-50 text-yellow-700',
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

// NPT repair-case lifecycle (§6). Pure + unit-tested — no I/O in this file.
//
// A received instrument is NOT a confirmed repair job. It enters at `received`
// and only becomes chargeable work once assessed and approved by the customer.
// Every transition is explicit so a case can never skip approval and land in
// `in_repair` by accident.

export const REPAIR_STATUSES = [
  { value: 'received', label: 'Received', group: 'intake' },
  { value: 'awaiting_assessment', label: 'Awaiting assessment', group: 'intake' },
  { value: 'assessed', label: 'Assessed', group: 'intake' },
  { value: 'quotation_required', label: 'Quotation required', group: 'approval' },
  { value: 'awaiting_customer_approval', label: 'Awaiting customer approval', group: 'approval' },
  { value: 'approved', label: 'Approved', group: 'approval' },
  { value: 'work_scheduled', label: 'Work scheduled', group: 'workshop' },
  { value: 'in_repair', label: 'In repair', group: 'workshop' },
  { value: 'awaiting_parts', label: 'Awaiting parts', group: 'workshop' },
  { value: 'quality_inspection', label: 'Quality inspection', group: 'workshop' },
  { value: 'ready_for_collection', label: 'Ready for collection or delivery', group: 'handover' },
  { value: 'collected', label: 'Collected', group: 'handover' },
  { value: 'delivered', label: 'Delivered', group: 'handover' },
  { value: 'closed', label: 'Closed', group: 'terminal' },
  { value: 'cancelled', label: 'Cancelled', group: 'terminal' },
] as const

export type RepairStatus = (typeof REPAIR_STATUSES)[number]['value']

const STATUS_VALUES = new Set<string>(REPAIR_STATUSES.map((s) => s.value))

export function isRepairStatus(value: string): value is RepairStatus {
  return STATUS_VALUES.has(value)
}

export function repairStatusLabel(value: string): string {
  return REPAIR_STATUSES.find((s) => s.value === value)?.label ?? value
}

/** Statuses from which no further work flows. */
export const TERMINAL_REPAIR_STATUSES: RepairStatus[] = ['closed', 'cancelled']

export function isTerminalRepairStatus(status: string): boolean {
  return (TERMINAL_REPAIR_STATUSES as string[]).includes(status)
}

/**
 * Allowed forward transitions. Cancellation is possible from any non-terminal
 * state and is handled separately, so it is not repeated in every list.
 */
const TRANSITIONS: Record<RepairStatus, RepairStatus[]> = {
  received: ['awaiting_assessment', 'assessed'],
  awaiting_assessment: ['assessed'],
  assessed: ['quotation_required', 'approved', 'work_scheduled'],
  quotation_required: ['awaiting_customer_approval'],
  awaiting_customer_approval: ['approved', 'cancelled'],
  approved: ['work_scheduled', 'in_repair'],
  work_scheduled: ['in_repair'],
  in_repair: ['awaiting_parts', 'quality_inspection'],
  awaiting_parts: ['in_repair'],
  quality_inspection: ['in_repair', 'ready_for_collection'],
  ready_for_collection: ['collected', 'delivered'],
  collected: ['closed'],
  delivered: ['closed'],
  closed: [],
  cancelled: [],
}

/** Statuses a case may move to next, cancellation included where legal. */
export function nextRepairStatuses(current: string): RepairStatus[] {
  if (!isRepairStatus(current)) return []
  const next = [...TRANSITIONS[current]]
  if (!isTerminalRepairStatus(current) && !next.includes('cancelled')) next.push('cancelled')
  return next
}

export function canTransitionRepair(from: string, to: string): boolean {
  return nextRepairStatuses(from).includes(to as RepairStatus)
}

/**
 * Validate a requested transition, returning a human-readable reason when it is
 * refused. Callers surface the reason; they must not proceed without `ok`.
 */
export function validateRepairTransition(from: string, to: string): { ok: boolean; reason?: string } {
  if (!isRepairStatus(to)) return { ok: false, reason: `"${to}" is not a repair status.` }
  if (from === to) return { ok: false, reason: 'The case is already at that status.' }
  if (isTerminalRepairStatus(from)) {
    return { ok: false, reason: `A ${repairStatusLabel(from).toLowerCase()} case cannot be moved again.` }
  }
  if (!canTransitionRepair(from, to)) {
    return {
      ok: false,
      reason: `A case at "${repairStatusLabel(from)}" cannot move straight to "${repairStatusLabel(to)}".`,
    }
  }
  return { ok: true }
}

/** Work that has left intake but not yet reached the customer — "in the workshop". */
export function isInWorkshop(status: string): boolean {
  const group = REPAIR_STATUSES.find((s) => s.value === status)?.group
  return group === 'workshop' || group === 'approval' || group === 'intake'
}

// ─── Progress statuses on the daily activity log (the technician notebook) ───

export const REPAIR_ACTIVITY_STATUSES = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'waiting_for_parts', label: 'Waiting for parts' },
  { value: 'waiting_for_approval', label: 'Waiting for approval' },
  { value: 'completed_for_day', label: 'Completed for the day' },
  { value: 'repair_complete', label: 'Repair complete' },
  { value: 'blocked', label: 'Blocked' },
] as const

export type RepairActivityStatus = (typeof REPAIR_ACTIVITY_STATUSES)[number]['value']

export function activityStatusLabel(value: string): string {
  return REPAIR_ACTIVITY_STATUSES.find((s) => s.value === value)?.label ?? value
}

// ─── Instrument categories (from the receiving form's printed rows) ──────────

export const INSTRUMENT_CATEGORIES = [
  { value: 'piano', label: 'Piano' },
  { value: 'keyboard', label: 'Keyboard' },
  { value: 'saxophone', label: 'Saxophone' },
  { value: 'guitar', label: 'Guitar' },
  { value: 'flute', label: 'Flute' },
  { value: 'clarinet', label: 'Clarinet' },
  { value: 'other', label: 'Other' },
] as const

export type InstrumentCategory = (typeof INSTRUMENT_CATEGORIES)[number]['value']

export function instrumentLabel(category: string, typeOther = ''): string {
  if (category === 'other') return typeOther.trim() || 'Other instrument'
  return INSTRUMENT_CATEGORIES.find((c) => c.value === category)?.label ?? category
}

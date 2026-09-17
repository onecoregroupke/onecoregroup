// The one serialisable shape of a duty and its day, shared by every surface that
// shows it — My Work, the Calendar drawer and Duty Management. Pure: no I/O, so
// the client component, the server loaders and the tests all agree on it.
//
// Two things are kept apart on purpose:
//   • the DEFINITION — the recurring duty and its checklist items, which only
//     Duty Management edits;
//   • the OCCURRENCE — one date's status, ticks, note and review, which the
//     assignee works. Ticking an item for 15 September writes a result row for
//     that date and never touches the definition.

export interface ChecklistItem {
  id: string
  label: string
  hint: string
  required: boolean
  /** The definition's own order. Items are always shown in this order. */
  position: number
}

export interface OccurrenceDto {
  dutyId: string
  date: string
  title: string
  description: string
  instructions: string
  dutyKind: string
  priority: string
  category: string
  location: string
  /** Human recurrence, e.g. "Every day", "Weekly on Mon, Thu". */
  frequency: string
  /** 'HH:MM' due time from the definition, or ''. */
  timeOfDay: string
  assigneeId: string | null
  assigneeName: string
  dueAt: string | null
  status: string
  overdue: boolean
  onTime: boolean | null
  reviewState: string
  reviewComment: string
  /** The named countersignatory, when the duty reserves one (§12). */
  reviewerName: string
  /** Who actually signed, captured at the time of signing. */
  reviewedBy: string
  reviewedAt: string | null
  /** Set when the duty cannot be completed without a specific form (§8). */
  requiredFormTemplateId: string | null
  formSubmissionId: string | null
  note: string
  checklistDone: number
  checklistTotal: number
  requiresNote: boolean
  requiresProof: boolean
  requiresChecklist: boolean
  requiresApproval: boolean
  /** Every ACTIVE checklist item of the definition, in position order. */
  checklist: ChecklistItem[]
  /** item_id → checked, from this date's saved result rows. */
  checked: Record<string, boolean>
}

/** A duty definition with no date attached — the management preview. */
export interface DutyDefinitionDto {
  id: string
  title: string
  description: string
  instructions: string
  dutyKind: string
  priority: string
  frequency: string
  timeOfDay: string
  location: string
  targetLabel: string
  requiresNote: boolean
  requiresProof: boolean
  requiresChecklist: boolean
  requiresApproval: boolean
  active: boolean
  paused: boolean
  checklist: ChecklistItem[]
}

/** Active items only, in the definition's position order (ties keep insertion order). */
export function orderChecklist<T extends { position: number; active?: boolean }>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.active !== false)
    .sort((a, b) => (a.item.position - b.item.position) || (a.index - b.index))
    .map(({ item }) => item)
}

export interface ChecklistProgress {
  done: number
  total: number
  requiredDone: number
  requiredTotal: number
}

/** Progress for one date, counted against the items actually shown. */
export function checklistProgress(items: ChecklistItem[], checked: Record<string, boolean>): ChecklistProgress {
  const required = items.filter((item) => item.required)
  return {
    done: items.filter((item) => checked[item.id]).length,
    total: items.length,
    requiredDone: required.filter((item) => checked[item.id]).length,
    requiredTotal: required.length,
  }
}

/** "3 of 6" — the phrase used on cards, the calendar and in the email. */
export function progressLabel(done: number, total: number): string {
  return `${done} of ${total}`
}

/** Whether the occurrence is settled for its date (and so no longer editable in place). */
export function isOccurrenceSettled(status: string): boolean {
  return status === 'done' || status === 'skipped'
}

/**
 * What the body of a duty should show when there is no checklist (§6 "Empty and
 * legacy states"): the description and instructions stand on their own rather
 * than sitting above an empty checklist box.
 */
export function dutyBodyMode(d: { checklist: unknown[]; description: string; instructions: string }): 'checklist' | 'text' | 'empty' {
  if (d.checklist.length > 0) return 'checklist'
  return d.description.trim() || d.instructions.trim() ? 'text' : 'empty'
}

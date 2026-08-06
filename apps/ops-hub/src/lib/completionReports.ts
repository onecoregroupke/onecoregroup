// Task completion reports and manager review (§§12–14). Pure rules here;
// persistence in completionService.ts. Unit-tested in completionReports.test.ts.

export interface TaskRequirements {
  requires_note?: boolean
  requires_evidence?: boolean
  requires_checklist?: boolean
  requires_approval?: boolean
  required_form_template_id?: string | null
}

export interface CompletionReport {
  summary?: string
  work_performed?: string
  outcome?: string
  challenges?: string
  follow_up?: string
  time_spent_minutes?: number | null
  file_urls?: string[]
  attachment_count?: number
  form_submission_id?: string | null
  checklist_done?: number
  checklist_total?: number
}

/** Total evidence attached, across legacy file_urls and the newer attachments. */
export function evidenceCount(report: CompletionReport): number {
  return (report.file_urls?.length ?? 0) + (report.attachment_count ?? 0)
}

/**
 * §12: "The system should not accept completion when a required report is
 * missing." Returns every unmet requirement at once.
 *
 * A note counts as present if EITHER summary or work_performed is filled — the
 * two fields exist because the schema predates this brief, and demanding both
 * would be a UI trap rather than a control.
 */
export function validateTaskCompletion(req: TaskRequirements, report: CompletionReport): string[] {
  const problems: string[] = []
  const hasNote = !!((report.summary ?? '').trim() || (report.work_performed ?? '').trim())

  if (req.requires_note && !hasNote) {
    problems.push('A completion note describing the work performed is required.')
  }
  if (req.requires_evidence && evidenceCount(report) < 1) {
    problems.push('Evidence (at least one attachment) is required before this task can be completed.')
  }
  if (req.requires_checklist) {
    const total = report.checklist_total ?? 0
    const done = report.checklist_done ?? 0
    if (total === 0) problems.push('This task requires a checklist but none is configured.')
    else if (done < total) problems.push(`All ${total} checklist items must be completed (${done} done).`)
  }
  if (req.required_form_template_id && !report.form_submission_id) {
    problems.push('The required form must be submitted before this task can be completed.')
  }
  if (report.time_spent_minutes != null && report.time_spent_minutes < 0) {
    problems.push('Time spent cannot be negative.')
  }
  return problems
}

/**
 * The status a task lands in once the assignee submits (§13).
 * With approval required the task is SUBMITTED, not completed — the assignee
 * cannot self-certify past a manager gate.
 */
export function statusAfterSubmission(req: TaskRequirements): string {
  return req.requires_approval ? 'Submitted' : 'Completed'
}

/** The review state the submission record itself carries. */
export function reviewStateAfterSubmission(req: TaskRequirements): string {
  return req.requires_approval ? 'pending' : 'not_required'
}

/** The status a task lands in after a manager decision (§13). */
export function statusAfterReview(decision: 'accepted' | 'reopened' | 'cancelled'): string {
  switch (decision) {
    case 'accepted': return 'Completed'
    case 'reopened': return 'Reopened'
    case 'cancelled': return 'Cancelled'
  }
}

/**
 * Whether a reviewer may act on this task. A reviewer must not accept their own
 * submitted work — the same separation-of-duties rule the procurement chain
 * already applies to requisition approval.
 */
export function canReviewSubmission(
  reviewer: { name: string; isManager: boolean },
  submission: { submitted_by: string },
): boolean {
  if (!reviewer.isManager) return false
  return reviewer.name.trim().toLowerCase() !== submission.submitted_by.trim().toLowerCase()
}

// ─── Daily operations summary (§14) ─────────────────────────────────────────

export interface OperationsEntry {
  entry_type: string
  entry_date: string
  employee: string | null
  brand_id: string | null
  department: string | null
  category: string | null
  completion_status: string
  completed_at: string | null
  review_state: string
  evidence_count: number
  from_duty: boolean
  priority?: string | null
}

export interface ManagerSummary {
  totalDue: number
  completed: number
  completedOnTime: number
  overdue: number
  submittedForReview: number
  reopened: number
  dutiesCompleted: number
  dutiesMissed: number
  tasksCompleted: number
  withEvidence: number
}

/**
 * §14's compact manager summary. Counts only — the drill-down reads the same
 * view with filters, so a number in the summary and the rows behind it can
 * never come from different queries.
 */
export function summariseOperations(
  entries: OperationsEntry[],
  extra: { totalDue?: number; overdue?: number; completedOnTime?: number } = {},
): ManagerSummary {
  const isDone = (e: OperationsEntry) => e.completion_status === 'done' || e.completion_status === 'Completed'
  const duties = entries.filter((e) => e.entry_type === 'duty')

  return {
    totalDue: extra.totalDue ?? entries.length,
    completed: entries.filter(isDone).length,
    completedOnTime: extra.completedOnTime ?? 0,
    overdue: extra.overdue ?? 0,
    submittedForReview: entries.filter((e) => e.review_state === 'pending').length,
    reopened: entries.filter((e) => e.review_state === 'reopened').length,
    dutiesCompleted: duties.filter(isDone).length,
    dutiesMissed: duties.filter((e) => e.completion_status === 'skipped').length,
    tasksCompleted: entries.filter((e) => e.entry_type === 'task' && isDone(e)).length,
    withEvidence: entries.filter((e) => e.evidence_count > 0).length,
  }
}

/** Drill-down grouping for §14 (brand / department / employee / category). */
export function groupOperations(
  entries: OperationsEntry[],
  by: 'brand_id' | 'department' | 'employee' | 'category' | 'entry_type',
): Array<{ key: string; total: number; completed: number; entries: OperationsEntry[] }> {
  const map = new Map<string, OperationsEntry[]>()
  for (const e of entries) {
    const key = (e[by] ?? '—') || '—'
    map.set(key, [...(map.get(key) ?? []), e])
  }
  return [...map.entries()]
    .map(([key, list]) => ({
      key,
      total: list.length,
      completed: list.filter((e) => e.completion_status === 'done' || e.completion_status === 'Completed').length,
      entries: list,
    }))
    .sort((a, b) => b.total - a.total)
}

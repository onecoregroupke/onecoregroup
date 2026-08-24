import { db } from './serverClient'
import type { DutyOccurrence } from './dutyOccurrences'
import type { OcgDutyChecklistItemRow, OcgDutyChecklistResultRow } from '@ocg/db'
import type { OccurrenceDto } from '@/components/duties/DutyOccurrenceCard'

/**
 * Flatten derived occurrences into the plain, serialisable shape the client
 * card renders. Checklist definitions and saved results are batch-loaded once
 * for the whole page rather than per card.
 *
 * This is a VIEW helper only — it creates nothing and writes nothing, so the
 * "one occurrence, many surfaces" guarantee is unaffected.
 */
export async function toOccurrenceDtos(occurrences: DutyOccurrence[]): Promise<OccurrenceDto[]> {
  if (occurrences.length === 0) return []

  const dutyIds = [...new Set(occurrences.map((o) => o.duty.id))]
  const logIds = occurrences.map((o) => o.log?.id).filter((id): id is string => !!id)
  // Named reviewers, resolved once for the whole page so §15 can tell the
  // employee WHO they are waiting on rather than just "a manager".
  const reviewerIds = [...new Set(
    occurrences.map((o) => o.duty.reviewer_id).filter((id): id is string => !!id),
  )]

  const [{ data: itemRows }, { data: resultRows }, { data: reviewerRows }] = await Promise.all([
    db().from('ocg_duty_checklist_items').select('*').in('duty_id', dutyIds).eq('active', true)
      .order('position', { ascending: true }),
    logIds.length > 0
      ? db().from('ocg_duty_checklist_results').select('*').in('log_id', logIds)
      : Promise.resolve({ data: [] as OcgDutyChecklistResultRow[] }),
    reviewerIds.length > 0
      ? db().from('ops_team_members').select('id, name').in('id', reviewerIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ])

  const reviewerName = new Map(
    ((reviewerRows as { id: string; name: string }[] | null) ?? []).map((m) => [m.id, m.name]),
  )

  const itemsByDuty = new Map<string, OcgDutyChecklistItemRow[]>()
  for (const item of ((itemRows as OcgDutyChecklistItemRow[] | null) ?? [])) {
    itemsByDuty.set(item.duty_id, [...(itemsByDuty.get(item.duty_id) ?? []), item])
  }

  const checkedByLog = new Map<string, Record<string, boolean>>()
  for (const r of ((resultRows as OcgDutyChecklistResultRow[] | null) ?? [])) {
    const map = checkedByLog.get(r.log_id) ?? {}
    map[r.item_id] = r.checked
    checkedByLog.set(r.log_id, map)
  }

  return occurrences.map((o) => ({
    dutyId: o.duty.id,
    date: o.date,
    title: o.duty.title,
    description: o.duty.description ?? '',
    instructions: o.duty.instructions ?? '',
    dutyKind: o.duty.duty_kind ?? 'task',
    priority: o.duty.priority ?? 'Medium',
    category: o.duty.category ?? '',
    location: o.duty.location ?? '',
    assigneeId: o.assignee.id,
    assigneeName: o.assignee.name,
    dueAt: o.dueAt,
    status: o.status,
    overdue: o.overdue,
    onTime: o.onTime,
    reviewState: o.reviewState,
    reviewComment: o.log?.review_comment ?? '',
    // §15: the employee should read "Awaiting review by Fatma" / "Reviewed by
    // Fatma · 24 Aug 2026", not a bare state word.
    reviewerName: o.duty.reviewer_id ? (reviewerName.get(o.duty.reviewer_id) ?? '') : '',
    reviewedBy: o.log?.reviewed_by ?? '',
    reviewedAt: o.log?.reviewed_at ?? null,
    requiredFormTemplateId: o.duty.required_form_template_id ?? null,
    formSubmissionId: o.log?.form_submission_id ?? null,
    note: o.log?.note ?? '',
    checklistDone: o.checklistDone,
    checklistTotal: o.checklistTotal,
    requiresNote: o.duty.requires_note === true,
    requiresProof: o.duty.requires_proof === true,
    requiresChecklist: o.duty.requires_checklist === true,
    requiresApproval: o.duty.requires_approval === true,
    checklist: (itemsByDuty.get(o.duty.id) ?? []).map((i) => ({
      id: i.id,
      label: i.label,
      hint: i.hint ?? '',
      required: i.required !== false,
    })),
    checked: o.log?.id ? (checkedByLog.get(o.log.id) ?? {}) : {},
  }))
}

import { db } from './serverClient'
import type { DutyOccurrence } from './dutyOccurrences'
import { describeRecurrence } from './recurrence'
import { describeDutyTarget } from './dutyModel'
import {
  orderChecklist, checklistProgress,
  type ChecklistItem, type DutyDefinitionDto, type OccurrenceDto,
} from './dutyDetail'
import type { OcgDailyDutyRow, OcgDutyChecklistItemRow, OcgDutyChecklistResultRow } from '@ocg/db'

/** Active checklist items per duty, in position order, in ONE query. */
async function checklistsFor(dutyIds: string[]): Promise<Map<string, ChecklistItem[]>> {
  const byDuty = new Map<string, ChecklistItem[]>()
  if (dutyIds.length === 0) return byDuty
  const { data } = await db().from('ocg_duty_checklist_items').select('*')
    .in('duty_id', dutyIds).eq('active', true)
    .order('position', { ascending: true })
  for (const row of orderChecklist((data as OcgDutyChecklistItemRow[] | null) ?? [])) {
    byDuty.set(row.duty_id, [...(byDuty.get(row.duty_id) ?? []), {
      id: row.id,
      label: row.label,
      hint: row.hint ?? '',
      required: row.required !== false,
      position: row.position ?? 0,
    }])
  }
  return byDuty
}

/**
 * Flatten derived occurrences into the plain, serialisable shape the shared duty
 * detail renders. Checklist definitions and saved results are batch-loaded once
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

  const [itemsByDuty, { data: resultRows }, { data: reviewerRows }] = await Promise.all([
    checklistsFor(dutyIds),
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

  const checkedByLog = new Map<string, Record<string, boolean>>()
  for (const r of ((resultRows as OcgDutyChecklistResultRow[] | null) ?? [])) {
    const map = checkedByLog.get(r.log_id) ?? {}
    map[r.item_id] = r.checked
    checkedByLog.set(r.log_id, map)
  }

  return occurrences.map((o) => {
    const checklist = itemsByDuty.get(o.duty.id) ?? []
    const checked = o.log?.id ? (checkedByLog.get(o.log.id) ?? {}) : {}
    // Progress for THIS date, counted from its result rows against the items
    // shown. A log written before results existed keeps its stored count.
    const hasResults = o.log?.id ? checkedByLog.has(o.log.id) : false
    const progress = checklistProgress(checklist, checked)
    return {
      dutyId: o.duty.id,
      date: o.date,
      title: o.duty.title,
      description: o.duty.description ?? '',
      instructions: o.duty.instructions ?? '',
      dutyKind: o.duty.duty_kind ?? 'task',
      priority: o.duty.priority ?? 'Medium',
      category: o.duty.category ?? '',
      location: o.duty.location ?? '',
      frequency: describeRecurrence(o.duty),
      timeOfDay: o.duty.time_of_day ?? '',
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
      checklistDone: hasResults ? progress.done : Math.min(o.checklistDone, checklist.length),
      checklistTotal: checklist.length,
      requiresNote: o.duty.requires_note === true,
      requiresProof: o.duty.requires_proof === true,
      requiresChecklist: o.duty.requires_checklist === true,
      requiresApproval: o.duty.requires_approval === true,
      checklist,
      checked,
    }
  })
}

/** Duty definitions for the management preview — no date, no results. */
export async function toDefinitionDtos(
  duties: OcgDailyDutyRow[],
  memberNameById: Map<string, string>,
): Promise<DutyDefinitionDto[]> {
  const itemsByDuty = await checklistsFor(duties.map((d) => d.id))
  return duties.map((d) => ({
    id: d.id,
    title: d.title,
    description: d.description ?? '',
    instructions: d.instructions ?? '',
    dutyKind: d.duty_kind ?? 'task',
    priority: d.priority ?? 'Medium',
    frequency: describeRecurrence(d),
    timeOfDay: d.time_of_day ?? '',
    location: d.location ?? '',
    targetLabel: describeDutyTarget(d, d.assignee_id ? memberNameById.get(d.assignee_id) : undefined),
    requiresNote: d.requires_note === true,
    requiresProof: d.requires_proof === true,
    requiresChecklist: d.requires_checklist === true,
    requiresApproval: d.requires_approval === true,
    active: d.active !== false,
    paused: d.paused === true,
    checklist: itemsByDuty.get(d.id) ?? [],
  }))
}

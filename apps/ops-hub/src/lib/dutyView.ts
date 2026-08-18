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

  const [{ data: itemRows }, { data: resultRows }] = await Promise.all([
    db().from('ocg_duty_checklist_items').select('*').in('duty_id', dutyIds).eq('active', true)
      .order('position', { ascending: true }),
    logIds.length > 0
      ? db().from('ocg_duty_checklist_results').select('*').in('log_id', logIds)
      : Promise.resolve({ data: [] as OcgDutyChecklistResultRow[] }),
  ])

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

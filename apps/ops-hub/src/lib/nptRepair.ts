import { db, nowIso } from './serverClient'
import { auditEvent } from './audit'
import { isTerminalRepairStatus, validateRepairTransition } from './nptRepairModel'
import type { NptActor } from './nptIntake'
import type {
  NptRepairActivityRow,
  NptRepairCaseRow,
  NptRepairCaseStatusHistoryRow,
} from '@ocg/db'

// =============================================================================
// NPT repair cases — the workshop side of an instrument's life.
//
// Status changes go through changeRepairStatus() only: the transition is
// validated against the lifecycle (nptRepairModel), the previous status is
// written to history, and the instrument's denormalised status/location follow.
// Nothing overwrites a status silently.
//
// The daily activity log replaces the technician notebook and is always bound
// to a case, so "what happened to this piano" is answerable from the case.
// =============================================================================

function auditActor(actor: NptActor) {
  return { userId: actor.userId ?? '', email: actor.email, name: actor.name }
}

export async function getRepairCase(id: string): Promise<NptRepairCaseRow | null> {
  if (!id) return null
  const { data } = await db().from('npt_repair_cases').select('*').eq('id', id).maybeSingle()
  return (data as NptRepairCaseRow | null) ?? null
}

export async function listRepairCases(
  opts: { status?: string; technicianId?: string; pianoId?: string; open?: boolean; limit?: number } = {},
): Promise<NptRepairCaseRow[]> {
  let q = db()
    .from('npt_repair_cases')
    .select('*')
    .order('opened_on', { ascending: false })
    .limit(opts.limit ?? 300)
  if (opts.status) q = q.eq('status', opts.status)
  if (opts.technicianId) q = q.eq('assigned_technician_id', opts.technicianId)
  if (opts.pianoId) q = q.eq('piano_id', opts.pianoId)
  const { data } = await q
  const rows = (data as NptRepairCaseRow[] | null) ?? []
  return opts.open ? rows.filter((r) => !isTerminalRepairStatus(r.status)) : rows
}

export async function getCaseStatusHistory(caseId: string): Promise<NptRepairCaseStatusHistoryRow[]> {
  const { data } = await db()
    .from('npt_repair_case_status_history')
    .select('*')
    .eq('repair_case_id', caseId)
    .order('created_at', { ascending: false })
  return (data as NptRepairCaseStatusHistoryRow[] | null) ?? []
}

/**
 * The only way a case changes status. Refuses illegal jumps (a received
 * instrument cannot go straight to `in_repair`), records who moved it and why,
 * and keeps the instrument's own status/location in step.
 */
export async function changeRepairStatus(input: {
  case_id: string
  to: string
  actor: NptActor
  comment?: string
  location?: string
}): Promise<NptRepairCaseRow> {
  const existing = await getRepairCase(input.case_id)
  if (!existing) throw new Error('Repair case not found')

  const check = validateRepairTransition(existing.status, input.to)
  if (!check.ok) throw new Error(check.reason ?? 'That status change is not allowed.')

  const now = nowIso()
  const update: Record<string, unknown> = { status: input.to, updated_at: now }
  if (input.location) update.current_location = input.location
  if (isTerminalRepairStatus(input.to)) update.closed_at = now

  const { data, error } = await db()
    .from('npt_repair_cases')
    .update(update)
    .eq('id', existing.id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  const updated = data as NptRepairCaseRow

  await db().from('npt_repair_case_status_history').insert({
    repair_case_id: existing.id,
    previous_status: existing.status,
    new_status: input.to,
    changed_by: input.actor.email,
    changed_by_name: input.actor.name,
    comment: input.comment ?? '',
  })

  if (existing.piano_id) {
    await db()
      .from('npt_pianos')
      .update({
        current_status: input.to,
        ...(input.location ? { current_location: input.location } : {}),
        // A closed or cancelled case is no longer the instrument's live case.
        ...(isTerminalRepairStatus(input.to) ? { current_repair_case_id: null } : {}),
        updated_at: now,
      })
      .eq('id', existing.piano_id)
  }

  await auditEvent({
    actor: auditActor(input.actor),
    action: 'status',
    entity_table: 'npt_repair_cases',
    entity_id: existing.id,
    entity_label: existing.reference ?? existing.id,
    before_data: { status: existing.status },
    after_data: { status: input.to },
  })

  return updated
}

export async function updateRepairCase(
  id: string,
  patch: Partial<
    Pick<
      NptRepairCaseRow,
      | 'priority'
      | 'assigned_technician_id'
      | 'consulting_guide_id'
      | 'reported_issue'
      | 'assessment_summary'
      | 'work_completed'
      | 'parts_used'
      | 'quoted_amount_ksh'
      | 'approved_amount_ksh'
      | 'expected_completion'
      | 'notes'
    >
  >,
  actor: NptActor,
): Promise<NptRepairCaseRow> {
  const existing = await getRepairCase(id)
  if (!existing) throw new Error('Repair case not found')
  if (isTerminalRepairStatus(existing.status)) {
    throw new Error('A closed or cancelled case can no longer be edited.')
  }
  const { data, error } = await db()
    .from('npt_repair_cases')
    .update({ ...patch, updated_at: nowIso() })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)

  await auditEvent({
    actor: auditActor(actor),
    action: 'update',
    entity_table: 'npt_repair_cases',
    entity_id: id,
    entity_label: existing.reference ?? id,
    before_data: existing as unknown as Record<string, unknown>,
    after_data: data as unknown as Record<string, unknown>,
  })
  return data as NptRepairCaseRow
}

// ─── Daily activity log (the technician notebook) ───────────────────────────

export async function listRepairActivities(
  opts: { caseId?: string; technicianId?: string; from?: string; to?: string; limit?: number } = {},
): Promise<NptRepairActivityRow[]> {
  let q = db()
    .from('npt_repair_activities')
    .select('*')
    .order('activity_date', { ascending: false })
    .limit(opts.limit ?? 300)
  if (opts.caseId) q = q.eq('repair_case_id', opts.caseId)
  if (opts.technicianId) q = q.eq('technician_id', opts.technicianId)
  if (opts.from) q = q.gte('activity_date', opts.from)
  if (opts.to) q = q.lte('activity_date', opts.to)
  const { data } = await q
  return (data as NptRepairActivityRow[] | null) ?? []
}

/** Log a day's work against a case. Refused once the case is closed. */
export async function logRepairActivity(input: {
  repair_case_id: string
  activity_date?: string
  technician_id?: string | null
  work_performed?: string
  parts_used?: string
  hours_spent?: number | null
  progress_status?: string
  challenges?: string
  next_action?: string
  expected_completion?: string | null
  actor: NptActor
}): Promise<NptRepairActivityRow> {
  const repairCase = await getRepairCase(input.repair_case_id)
  if (!repairCase) throw new Error('Repair case not found')
  if (isTerminalRepairStatus(repairCase.status)) {
    throw new Error('That case is closed — reopen it before logging more work.')
  }
  if (!(input.work_performed ?? '').trim() && !(input.challenges ?? '').trim()) {
    throw new Error('Describe the work done or the challenge encountered.')
  }

  const { data, error } = await db()
    .from('npt_repair_activities')
    .insert({
      repair_case_id: repairCase.id,
      piano_id: repairCase.piano_id,
      activity_date: input.activity_date || nowIso().slice(0, 10),
      technician_id: input.technician_id ?? repairCase.assigned_technician_id,
      work_performed: input.work_performed ?? '',
      parts_used: input.parts_used ?? '',
      hours_spent: input.hours_spent ?? null,
      progress_status: input.progress_status || 'in_progress',
      challenges: input.challenges ?? '',
      next_action: input.next_action ?? '',
      expected_completion: input.expected_completion ?? null,
      entered_by: input.actor.email,
      entered_by_name: input.actor.name,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as NptRepairActivityRow
}

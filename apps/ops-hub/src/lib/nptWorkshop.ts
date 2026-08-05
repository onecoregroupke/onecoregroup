import { db, nowIso } from './serverClient'
import type { NptActor } from './nptIntake'
import type { NptWorkshopPlanRow, NptWorkshopPlanRowRow } from '@ocg/db'

// =============================================================================
// NPT Daily Job Allocation / Consultancy Guide / Planner.
//
// One plan per brand per day (UNIQUE(brand_id, plan_date)) so opening the
// planner twice cannot create two days. The paper form's three tables —
// allocation, review of yesterday, challenges of yesterday — share the same
// four columns, so they are one row shape distinguished by `section`.
//
// Rows referencing a real repair case are the link back into the workshop: the
// planner allocates work to cases, it does not invent a parallel job list.
// =============================================================================

export const PLAN_SECTIONS = ['allocation', 'review', 'challenge'] as const
export type PlanSection = (typeof PLAN_SECTIONS)[number]

export const CLEANLINESS_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'na', label: 'Not applicable' },
] as const

export async function getPlan(id: string): Promise<NptWorkshopPlanRow | null> {
  if (!id) return null
  const { data } = await db().from('npt_workshop_plans').select('*').eq('id', id).maybeSingle()
  return (data as NptWorkshopPlanRow | null) ?? null
}

export async function getPlanRows(planId: string): Promise<NptWorkshopPlanRowRow[]> {
  const { data } = await db()
    .from('npt_workshop_plan_rows')
    .select('*')
    .eq('plan_id', planId)
    .order('section', { ascending: true })
    .order('sort_order', { ascending: true })
  return (data as NptWorkshopPlanRowRow[] | null) ?? []
}

export async function listPlans(opts: { from?: string; to?: string; limit?: number } = {}): Promise<NptWorkshopPlanRow[]> {
  let q = db()
    .from('npt_workshop_plans')
    .select('*')
    .order('plan_date', { ascending: false })
    .limit(opts.limit ?? 90)
  if (opts.from) q = q.gte('plan_date', opts.from)
  if (opts.to) q = q.lte('plan_date', opts.to)
  const { data } = await q
  return (data as NptWorkshopPlanRow[] | null) ?? []
}

/** Open (or create) the plan for a date. Never creates a second plan for a day. */
export async function openPlanForDate(
  planDate: string,
  brandId: string | null,
  actor: NptActor,
): Promise<NptWorkshopPlanRow> {
  const { data: existing } = await db().from('npt_workshop_plans').select('*').eq('plan_date', planDate)
  const found = (existing as NptWorkshopPlanRow[] | null)?.find((p) => (p.brand_id ?? null) === brandId)
  if (found) return found

  const { data, error } = await db()
    .from('npt_workshop_plans')
    .insert({ plan_date: planDate, brand_id: brandId, status: 'draft', created_by: actor.email })
    .select('*')
    .single()
  if (error) {
    // Lost the race against a concurrent opener — return theirs.
    const { data: retry } = await db()
      .from('npt_workshop_plans')
      .select('*')
      .eq('plan_date', planDate)
      .limit(1)
    const row = (retry as NptWorkshopPlanRow[] | null)?.find((p) => (p.brand_id ?? null) === brandId)
    if (row) return row
    throw new Error(error.message)
  }
  return data as NptWorkshopPlanRow
}

export interface PlanRowInput {
  section?: PlanSection
  repair_case_id?: string | null
  piano_id?: string | null
  instrument_label?: string
  technician_id?: string | null
  consulting_guide_id?: string | null
  target_plan?: string
  priority?: string
  expected_result?: string
  due_at?: string
  actual_outcome?: string
  outcome_status?: string
  comment?: string
  challenge?: string
  required_intervention?: string
  responsible_person_id?: string | null
  resolution_target?: string | null
}

/** Replace the rows of one section. Sections are saved independently. */
export async function savePlanSection(
  planId: string,
  section: PlanSection,
  rows: PlanRowInput[],
): Promise<NptWorkshopPlanRowRow[]> {
  const plan = await getPlan(planId)
  if (!plan) throw new Error('Plan not found')
  if (plan.status === 'reviewed') throw new Error('This plan has been reviewed and can no longer be edited.')

  const cleaned = rows
    .filter((r) => (r.instrument_label ?? '').trim() !== '' || r.repair_case_id || r.piano_id)
    .map((r, index) => ({
      plan_id: planId,
      section,
      repair_case_id: r.repair_case_id ?? null,
      piano_id: r.piano_id ?? null,
      instrument_label: r.instrument_label ?? '',
      technician_id: r.technician_id ?? null,
      consulting_guide_id: r.consulting_guide_id ?? null,
      target_plan: r.target_plan ?? '',
      priority: r.priority || 'Medium',
      expected_result: r.expected_result ?? '',
      due_at: r.due_at ?? '',
      actual_outcome: r.actual_outcome ?? '',
      outcome_status: r.outcome_status ?? '',
      comment: r.comment ?? '',
      challenge: r.challenge ?? '',
      required_intervention: r.required_intervention ?? '',
      responsible_person_id: r.responsible_person_id ?? null,
      resolution_target: r.resolution_target ?? null,
      sort_order: index,
    }))

  await db().from('npt_workshop_plan_rows').delete().eq('plan_id', planId).eq('section', section)
  if (cleaned.length === 0) return []
  const { data, error } = await db().from('npt_workshop_plan_rows').insert(cleaned).select('*')
  if (error) throw new Error(error.message)

  // Allocating a case to a technician in the planner assigns it on the case too,
  // so the planner and the workshop never disagree about who has what.
  for (const row of cleaned) {
    if (section === 'allocation' && row.repair_case_id && row.technician_id) {
      await db()
        .from('npt_repair_cases')
        .update({
          assigned_technician_id: row.technician_id,
          consulting_guide_id: row.consulting_guide_id,
          updated_at: nowIso(),
        })
        .eq('id', row.repair_case_id)
    }
  }
  return (data as NptWorkshopPlanRowRow[] | null) ?? []
}

export async function updatePlanHeader(
  planId: string,
  patch: Partial<
    Pick<
      NptWorkshopPlanRow,
      'workshop_clean' | 'workshop_comment' | 'showroom_clean' | 'showroom_comment' | 'manager_comment' | 'director_comment'
    >
  >,
): Promise<NptWorkshopPlanRow> {
  const plan = await getPlan(planId)
  if (!plan) throw new Error('Plan not found')
  if (plan.status === 'reviewed') throw new Error('This plan has been reviewed and can no longer be edited.')
  const { data, error } = await db()
    .from('npt_workshop_plans')
    .update({ ...patch, updated_at: nowIso() })
    .eq('id', planId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as NptWorkshopPlanRow
}

export async function submitPlan(planId: string, actor: NptActor): Promise<NptWorkshopPlanRow> {
  const plan = await getPlan(planId)
  if (!plan) throw new Error('Plan not found')
  if (plan.status !== 'draft') throw new Error('This plan has already been submitted.')
  const now = nowIso()
  const { data, error } = await db()
    .from('npt_workshop_plans')
    .update({ status: 'submitted', completed_at: now, updated_at: now })
    .eq('id', planId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  void actor
  return data as NptWorkshopPlanRow
}

/** Manager or director sign-off. Acknowledging as both closes the plan. */
export async function acknowledgePlan(input: {
  plan_id: string
  role: 'manager' | 'director'
  comment?: string
  actor: NptActor
}): Promise<NptWorkshopPlanRow> {
  const plan = await getPlan(input.plan_id)
  if (!plan) throw new Error('Plan not found')
  if (plan.status === 'draft') throw new Error('This plan has not been submitted yet.')

  const now = nowIso()
  const update: Record<string, unknown> = { updated_at: now }
  if (input.role === 'manager') {
    update.manager_ack_by = input.actor.email
    update.manager_ack_at = now
    if (input.comment) update.manager_comment = input.comment
  } else {
    update.director_ack_by = input.actor.email
    update.director_ack_at = now
    if (input.comment) update.director_comment = input.comment
  }

  const managerDone = input.role === 'manager' || Boolean(plan.manager_ack_at)
  const directorDone = input.role === 'director' || Boolean(plan.director_ack_at)
  if (managerDone && directorDone) update.status = 'reviewed'

  const { data, error } = await db()
    .from('npt_workshop_plans')
    .update(update)
    .eq('id', input.plan_id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as NptWorkshopPlanRow
}

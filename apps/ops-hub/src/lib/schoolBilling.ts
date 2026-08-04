import { db, nowIso } from './serverClient'
import { roundMoney } from './money'
import { auditEvent } from './audit'
import { resolveSchoolBrandId, ensureChargeCategory, postLedgerEntry } from './schoolFinance'
import type { Actor } from './api-auth'
import type {
  School,
  SchoolProgrammeRow,
  SchoolFeeStructureRow,
  SchoolFeeStructureItemRow,
  SchoolEnrollmentRow,
  SchoolLedgerEntryRow,
} from '@ocg/db'

// =============================================================================
// Course-billing configuration for the schools (migration 044). Programmes are
// the courses/modules a school offers; a fee structure is a VERSIONED price list
// for a programme (never edited once active — a new version is cut instead).
// Enrolling a student builds a charge schedule from the structure and posts it
// as DRAFT ledger entries for review (explicit post commits them — never auto).
// =============================================================================

// ── Pure charge-schedule builder (IO-free, unit tested) ──────────────────────
export interface ChargeLine {
  category_id: string | null
  label: string
  amount_ksh: number
  billing_cadence: string
  is_required: boolean
}

/**
 * Turn fee-structure items into the concrete charge lines an enrolment would
 * post. Required items always; optional items only when includeOptional. Zero /
 * negative amounts are dropped. Pure — the enrolment writer calls this then posts.
 */
export function buildChargeSchedule(
  items: Pick<SchoolFeeStructureItemRow, 'category_id' | 'label' | 'amount_ksh' | 'billing_cadence' | 'is_required'>[],
  opts: { includeOptional?: boolean } = {},
): ChargeLine[] {
  return items
    .filter((it) => (opts.includeOptional ? true : it.is_required))
    .filter((it) => (Number(it.amount_ksh) || 0) > 0)
    .map((it) => ({
      category_id: it.category_id ?? null,
      label: it.label,
      amount_ksh: roundMoney(Number(it.amount_ksh) || 0),
      billing_cadence: it.billing_cadence || 'one_off',
      is_required: it.is_required,
    }))
}

export function scheduleTotal(lines: ChargeLine[]): number {
  return roundMoney(lines.reduce((sum, l) => sum + l.amount_ksh, 0))
}

// ── Programmes ───────────────────────────────────────────────────────────────
export async function listProgrammes(school: School): Promise<SchoolProgrammeRow[]> {
  const { data } = await db()
    .from('school_programmes')
    .select('*')
    .eq('school', school)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  return (data as SchoolProgrammeRow[] | null) ?? []
}

export async function upsertProgramme(
  school: School,
  input: { id?: string; name: string; kind?: string; code?: string; duration_label?: string; applies_to?: string; completion_requirements?: string; is_active?: boolean; sort_order?: number; notes?: string },
  actor: Pick<Actor, 'userId' | 'email' | 'name'>,
): Promise<SchoolProgrammeRow> {
  if (!input.name?.trim()) throw new Error('Programme name is required')
  const patch = {
    name: input.name.trim(),
    kind: input.kind ?? 'course',
    code: input.code ?? '',
    duration_label: input.duration_label ?? '',
    applies_to: input.applies_to ?? '',
    completion_requirements: input.completion_requirements ?? '',
    is_active: input.is_active ?? true,
    sort_order: input.sort_order ?? 0,
    notes: input.notes ?? '',
    updated_at: nowIso(),
  }
  if (input.id) {
    const { data, error } = await db().from('school_programmes').update(patch).eq('id', input.id).select('*').single()
    if (error) throw new Error(error.message)
    await auditEvent({ actor, action: 'school_programme.update', entity_table: 'school_programmes', entity_id: input.id, entity_label: patch.name })
    return data as SchoolProgrammeRow
  }
  const { data, error } = await db().from('school_programmes').insert({ school, brand_id: await resolveSchoolBrandId(school), ...patch }).select('*').single()
  if (error) throw new Error(error.message)
  const row = data as SchoolProgrammeRow
  await auditEvent({ actor, action: 'school_programme.create', entity_table: 'school_programmes', entity_id: row.id, entity_label: patch.name })
  return row
}

// ── Fee structures (versioned) ───────────────────────────────────────────────
export interface FeeStructureWithItems extends SchoolFeeStructureRow {
  items: SchoolFeeStructureItemRow[]
}

export async function listFeeStructures(school: School, opts: { programmeId?: string } = {}): Promise<FeeStructureWithItems[]> {
  let q = db().from('school_fee_structures').select('*').eq('school', school)
  if (opts.programmeId) q = q.eq('programme_id', opts.programmeId)
  const { data } = await q.order('programme_id', { ascending: true }).order('version', { ascending: false })
  const structures = (data as SchoolFeeStructureRow[] | null) ?? []
  if (structures.length === 0) return []
  const { data: itemData } = await db()
    .from('school_fee_structure_items')
    .select('*')
    .in('fee_structure_id', structures.map((s) => s.id))
    .order('sort_order', { ascending: true })
  const items = (itemData as SchoolFeeStructureItemRow[] | null) ?? []
  return structures.map((s) => ({ ...s, items: items.filter((it) => it.fee_structure_id === s.id) }))
}

async function nextStructureVersion(school: School, programmeId: string | null): Promise<number> {
  let q = db().from('school_fee_structures').select('version').eq('school', school)
  q = programmeId ? q.eq('programme_id', programmeId) : q.is('programme_id', null)
  const { data } = await q.order('version', { ascending: false }).limit(1)
  const rows = (data as { version: number }[] | null) ?? []
  return (rows[0]?.version ?? 0) + 1
}

export async function createFeeStructure(
  school: School,
  input: {
    programme_id?: string | null
    name?: string
    academic_year?: string
    effective_from?: string | null
    status?: string
    notes?: string
    items: { label: string; amount_ksh: number; billing_cadence?: string; is_required?: boolean; is_completion_req?: boolean; category_id?: string | null }[]
  },
  actor: Pick<Actor, 'userId' | 'email' | 'name'>,
): Promise<FeeStructureWithItems> {
  const brandId = await resolveSchoolBrandId(school)
  const programmeId = input.programme_id ?? null
  const version = await nextStructureVersion(school, programmeId)
  const { data, error } = await db().from('school_fee_structures').insert({
    school, brand_id: brandId, programme_id: programmeId, version,
    name: input.name || `Fee structure v${version}`,
    academic_year: input.academic_year ?? '',
    effective_from: input.effective_from ?? nowIso().slice(0, 10),
    status: input.status ?? 'active',
    currency: 'KES',
    notes: input.notes ?? '',
  }).select('*').single()
  if (error) throw new Error(error.message)
  const structure = data as SchoolFeeStructureRow

  // Bind each item to a charge category (creating one by label if needed) so the
  // student-account "by category" breakdown stays meaningful after enrolment.
  const items: SchoolFeeStructureItemRow[] = []
  let sort = 0
  for (const it of input.items) {
    if (!it.label?.trim()) continue
    let categoryId = it.category_id ?? null
    if (!categoryId) {
      const cat = await ensureChargeCategory(school, { name: it.label.trim(), billing_cadence: it.billing_cadence, brand_id: brandId })
      categoryId = cat.id
    }
    const { data: itemRow, error: itemErr } = await db().from('school_fee_structure_items').insert({
      fee_structure_id: structure.id,
      category_id: categoryId,
      label: it.label.trim(),
      amount_ksh: roundMoney(Number(it.amount_ksh) || 0),
      billing_cadence: it.billing_cadence ?? 'term',
      is_required: it.is_required ?? true,
      is_completion_req: it.is_completion_req ?? false,
      sort_order: sort++,
    }).select('*').single()
    if (itemErr) throw new Error(itemErr.message)
    items.push(itemRow as SchoolFeeStructureItemRow)
  }
  await auditEvent({ actor, action: 'school_fee_structure.create', entity_table: 'school_fee_structures', entity_id: structure.id, entity_label: `${structure.name} v${version}` })
  return { ...structure, items }
}

export async function setFeeStructureStatus(id: string, status: string, actor: Pick<Actor, 'userId' | 'email' | 'name'>): Promise<SchoolFeeStructureRow> {
  const { data, error } = await db().from('school_fee_structures').update({ status, updated_at: nowIso() }).eq('id', id).select('*').single()
  if (error) throw new Error(error.message)
  await auditEvent({ actor, action: 'school_fee_structure.status', entity_table: 'school_fee_structures', entity_id: id, entity_label: status })
  return data as SchoolFeeStructureRow
}

// ── Enrolment → draft charge schedule ────────────────────────────────────────
export async function listEnrollments(school: School, studentId?: string): Promise<SchoolEnrollmentRow[]> {
  let q = db().from('school_enrollments').select('*').eq('school', school)
  if (studentId) q = q.eq('student_id', studentId)
  const { data } = await q.order('created_at', { ascending: false })
  return (data as SchoolEnrollmentRow[] | null) ?? []
}

export interface EnrollmentPreview {
  schedule: ChargeLine[]
  total: number
  structure: SchoolFeeStructureRow | null
}

export async function previewEnrollment(school: School, feeStructureId: string, opts: { includeOptional?: boolean } = {}): Promise<EnrollmentPreview> {
  const { data: structure } = await db().from('school_fee_structures').select('*').eq('id', feeStructureId).maybeSingle()
  const { data: itemData } = await db().from('school_fee_structure_items').select('*').eq('fee_structure_id', feeStructureId).order('sort_order', { ascending: true })
  const schedule = buildChargeSchedule((itemData as SchoolFeeStructureItemRow[] | null) ?? [], opts)
  return { schedule, total: scheduleTotal(schedule), structure: (structure as SchoolFeeStructureRow | null) ?? null }
}

/**
 * Enrol a student on a programme and post the fee structure's charge schedule as
 * DRAFT ledger entries (reviewable on the student account, committed explicitly).
 * Returns the enrolment, the draft entries, and the schedule that was posted.
 */
export async function enrolStudent(
  input: {
    school: School
    student_id: string
    student_admission_no?: string
    programme_id?: string | null
    fee_structure_id: string
    academic_year?: string
    term?: string
    start_date?: string | null
    includeOptional?: boolean
  },
  allowed: string[] | null,
  actor: Pick<Actor, 'userId' | 'email' | 'name'>,
): Promise<{ enrollment: SchoolEnrollmentRow; entries: SchoolLedgerEntryRow[]; schedule: ChargeLine[] }> {
  if (!input.student_id) throw new Error('student is required')
  if (!input.fee_structure_id) throw new Error('a fee structure is required')
  const brandId = await resolveSchoolBrandId(input.school)
  const { schedule } = await previewEnrollment(input.school, input.fee_structure_id, { includeOptional: input.includeOptional })

  const { data: enrolData, error: enrolErr } = await db().from('school_enrollments').insert({
    school: input.school, brand_id: brandId,
    student_id: input.student_id, student_admission_no: input.student_admission_no ?? '',
    programme_id: input.programme_id ?? null, fee_structure_id: input.fee_structure_id,
    academic_year: input.academic_year ?? '', term: input.term ?? '',
    status: 'active', start_date: input.start_date ?? nowIso().slice(0, 10),
  }).select('*').single()
  if (enrolErr) throw new Error(enrolErr.message)
  const enrollment = enrolData as SchoolEnrollmentRow

  const entries: SchoolLedgerEntryRow[] = []
  for (const line of schedule) {
    const entry = await postLedgerEntry({
      school: input.school, brand_id: brandId, student_id: input.student_id, student_admission_no: input.student_admission_no,
      enrollment_id: enrollment.id, category_id: line.category_id, category_label: line.label,
      entry_type: 'charge', academic_year: input.academic_year, term: input.term,
      description: line.label, amount_ksh: line.amount_ksh, state: 'draft',
    }, allowed, actor)
    entries.push(entry)
  }
  await auditEvent({
    actor, action: 'school_enrollment.create', entity_table: 'school_enrollments', entity_id: enrollment.id,
    entity_label: `${input.school} enrolment · ${schedule.length} draft charges`,
  })
  return { enrollment, entries, schedule }
}

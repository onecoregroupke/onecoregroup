import { db, nowIso } from './serverClient'
import { assertBrandInScope } from './finance'
import { roundMoney } from './money'
import { snapshotVersion } from './recordVersions'
import { auditEvent } from './audit'
import type { Actor } from './api-auth'
import type {
  School,
  SchoolChargeCategoryRow,
  SchoolLedgerEntryRow,
  SchoolLedgerEntryType,
} from '@ocg/db'

// =============================================================================
// Canonical student-account ledger (migration 044). One scoped layer for all
// three schools. Balances are ALWAYS derived from ledger entries — the workbook
// BALANCE column is stored for audit only. Posted entries are immutable;
// corrections use reversal/adjustment entries. Autosave writes DRAFT entries.
//
// Balance convention (documented once, applied everywhere):
//   charge / opening_balance / refund  → increase amount due (debit, +)
//   payment / write_off                → decrease amount due (credit, −)
//   adjustment                         → signed by the amount's sign
//   reversal                           → audit marker only (0); the reversed
//                                        original is excluded via state='reversed'
//   POSITIVE balance = owed (debtor). NEGATIVE = credit / overpaid.
// =============================================================================

export const SCHOOL_BRAND_SLUG: Record<School, string> = {
  rayyan: 'ar-rayyan-playhouse',
  rhythms: 'rhythms-college',
  darul: 'darul-swafa',
}

export const SCHOOL_STUDENT_TABLE: Record<School, string> = {
  rayyan: 'rayyan_students',
  rhythms: 'rhythms_students',
  darul: 'darul_students',
}

export const SCHOOL_SECTION_KEY: Record<School, 'rayyan_admin' | 'rhythms_admin' | 'darul_admin'> = {
  rayyan: 'rayyan_admin',
  rhythms: 'rhythms_admin',
  darul: 'darul_admin',
}

/** Resolve the brand UUID for a school (cached-ish; small table). */
export async function resolveSchoolBrandId(school: School): Promise<string | null> {
  const { data } = await db().from('brands').select('id').eq('slug', SCHOOL_BRAND_SLUG[school]).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

// Pure balance derivation lives in ./schoolBalance (unit tested, IO-free).
export { signedAmount, summariseStudentAccount } from './schoolBalance'
export type { StudentAccountSummary } from './schoolBalance'

// ── Charge categories ────────────────────────────────────────────────────────
export async function listChargeCategories(school: School): Promise<SchoolChargeCategoryRow[]> {
  const { data } = await db()
    .from('school_charge_categories')
    .select('*')
    .eq('school', school)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  return (data as SchoolChargeCategoryRow[] | null) ?? []
}

/** Find a category by (school, code) or create it. Used by imports + config. */
export async function ensureChargeCategory(
  school: School,
  input: { code?: string; name: string; section?: string; kind?: string; billing_cadence?: string; brand_id?: string | null },
): Promise<SchoolChargeCategoryRow> {
  const code = (input.code || input.name).trim().toLowerCase().replace(/\s+/g, '_')
  const { data: existing } = await db()
    .from('school_charge_categories')
    .select('*')
    .eq('school', school)
    .eq('code', code)
    .maybeSingle()
  if (existing) return existing as SchoolChargeCategoryRow
  const { data, error } = await db()
    .from('school_charge_categories')
    .insert({
      school,
      brand_id: input.brand_id ?? (await resolveSchoolBrandId(school)),
      section: input.section ?? '',
      code,
      name: input.name.trim(),
      kind: input.kind ?? 'charge',
      billing_cadence: input.billing_cadence ?? 'one_off',
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as SchoolChargeCategoryRow
}

// ── Ledger reads ─────────────────────────────────────────────────────────────
export async function studentLedger(
  school: School,
  studentId: string,
  opts: { includeDrafts?: boolean } = {},
): Promise<SchoolLedgerEntryRow[]> {
  let q = db()
    .from('school_ledger_entries')
    .select('*')
    .eq('school', school)
    .eq('student_id', studentId)
    .order('entry_date', { ascending: true })
    .order('created_at', { ascending: true })
  if (!opts.includeDrafts) q = q.neq('state', 'draft')
  const { data } = await q
  return (data as SchoolLedgerEntryRow[] | null) ?? []
}


// ── Ledger writes ────────────────────────────────────────────────────────────
export interface LedgerEntryInput {
  school: School
  brand_id?: string | null
  student_id: string
  student_admission_no?: string
  enrollment_id?: string | null
  category_id?: string | null
  category_label?: string
  section?: string
  entry_type: SchoolLedgerEntryType
  entry_date?: string
  academic_year?: string
  term?: string
  description?: string
  amount_ksh: number
  method?: string
  receipt_no?: string
  mpesa_code?: string
  receiving_account_id?: string | null
  state?: 'draft' | 'posted'
  source_balance?: number | null
  source_workbook?: string
  source_sheet?: string
  source_row?: number | null
  import_id?: string | null
  notes?: string
  comment?: string
}

export async function postLedgerEntry(
  input: LedgerEntryInput,
  allowed: string[] | null,
  actor: Pick<Actor, 'userId' | 'email' | 'name'>,
): Promise<SchoolLedgerEntryRow> {
  const brandId = input.brand_id ?? (await resolveSchoolBrandId(input.school))
  assertBrandInScope(brandId, allowed, `record ${input.school} student account`)
  if (!input.student_id) throw new Error('student_id is required')
  const state = input.state ?? 'posted'
  const supabase = db()
  const { data, error } = await supabase
    .from('school_ledger_entries')
    .insert({
      school: input.school,
      brand_id: brandId,
      student_id: input.student_id,
      student_admission_no: input.student_admission_no ?? '',
      enrollment_id: input.enrollment_id ?? null,
      category_id: input.category_id ?? null,
      category_label: input.category_label ?? '',
      section: input.section ?? '',
      entry_type: input.entry_type,
      entry_date: input.entry_date || nowIso().slice(0, 10),
      academic_year: input.academic_year ?? '',
      term: input.term ?? '',
      description: input.description ?? '',
      amount_ksh: roundMoney(Number(input.amount_ksh) || 0),
      method: input.method ?? '',
      receipt_no: input.receipt_no ?? '',
      mpesa_code: input.mpesa_code ?? '',
      receiving_account_id: input.receiving_account_id ?? null,
      state,
      source_balance: input.source_balance ?? null,
      source_workbook: input.source_workbook ?? '',
      source_sheet: input.source_sheet ?? '',
      source_row: input.source_row ?? null,
      import_id: input.import_id ?? null,
      notes: input.notes ?? '',
      comment: input.comment ?? '',
      recorded_by: actor.name || actor.email || 'unknown',
      posted_by: state === 'posted' ? actor.name || actor.email || '' : '',
      posted_at: state === 'posted' ? nowIso() : null,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  const row = data as SchoolLedgerEntryRow
  await snapshotVersion({
    record_type: 'school_ledger_entries',
    record_id: row.id,
    action: state === 'posted' ? 'post' : 'create',
    snapshot: row as unknown as Record<string, unknown>,
    brand_id: row.brand_id,
    changed_by: actor.name || actor.email || '',
    import_id: input.import_id ?? null,
  })
  await auditEvent({
    actor,
    action: `school_ledger.${input.entry_type}`,
    entity_table: 'school_ledger_entries',
    entity_id: row.id,
    entity_label: `${input.school} ${input.entry_type} ${row.amount_ksh}`,
    after_data: row as unknown as Record<string, unknown>,
  })
  return row
}

/**
 * Reverse a POSTED ledger entry. Never edits or deletes the original: marks it
 * `reversed` (excluded from the balance) and writes an audit-marker reversal
 * entry. Reason is required.
 */
export async function reverseLedgerEntry(
  id: string,
  reason: string,
  allowed: string[] | null,
  actor: Pick<Actor, 'userId' | 'email' | 'name'>,
): Promise<SchoolLedgerEntryRow> {
  const supabase = db()
  const { data: existing } = await supabase.from('school_ledger_entries').select('*').eq('id', id).maybeSingle()
  if (!existing) throw new Error('Ledger entry not found')
  const before = existing as SchoolLedgerEntryRow
  if (before.state !== 'posted') throw new Error('Only posted entries can be reversed')
  if (!reason?.trim()) throw new Error('A reason is required to reverse a posted entry')
  assertBrandInScope(before.brand_id ?? null, allowed, 'reverse student account')

  await supabase.from('school_ledger_entries').update({ state: 'reversed', updated_at: nowIso() }).eq('id', id)
  const { data, error } = await supabase
    .from('school_ledger_entries')
    .insert({
      school: before.school,
      brand_id: before.brand_id,
      student_id: before.student_id,
      student_admission_no: before.student_admission_no,
      category_id: before.category_id,
      category_label: before.category_label,
      section: before.section,
      entry_type: 'reversal',
      entry_date: nowIso().slice(0, 10),
      academic_year: before.academic_year,
      term: before.term,
      description: `Reversal of ${before.entry_type} on ${before.entry_date}: ${reason.trim()}`,
      amount_ksh: before.amount_ksh,
      state: 'posted',
      reverses_entry_id: id,
      recorded_by: actor.name || actor.email || 'unknown',
      posted_by: actor.name || actor.email || '',
      posted_at: nowIso(),
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  const reversal = data as SchoolLedgerEntryRow
  await snapshotVersion({
    record_type: 'school_ledger_entries', record_id: id, action: 'reverse',
    snapshot: { ...(before as unknown as Record<string, unknown>), state: 'reversed' },
    previous_snapshot: before as unknown as Record<string, unknown>,
    brand_id: before.brand_id, changed_by: actor.name || actor.email || '', reason: reason.trim(),
  })
  await auditEvent({
    actor, action: 'school_ledger.reverse', entity_table: 'school_ledger_entries', entity_id: id,
    before_data: before as unknown as Record<string, unknown>,
    after_data: reversal as unknown as Record<string, unknown>,
  })
  return reversal
}

/**
 * Commit a DRAFT ledger entry to posted (the explicit human step after an
 * enrolment posts a draft charge schedule, or after an autosave draft). Only
 * drafts can be posted; posted/reversed entries are immutable.
 */
export async function commitLedgerEntry(
  id: string,
  allowed: string[] | null,
  actor: Pick<Actor, 'userId' | 'email' | 'name'>,
): Promise<SchoolLedgerEntryRow> {
  const supabase = db()
  const { data: existing } = await supabase.from('school_ledger_entries').select('*').eq('id', id).maybeSingle()
  if (!existing) throw new Error('Ledger entry not found')
  const before = existing as SchoolLedgerEntryRow
  if (before.state !== 'draft') throw new Error('Only draft entries can be posted')
  assertBrandInScope(before.brand_id ?? null, allowed, 'post student account')
  const { data, error } = await supabase
    .from('school_ledger_entries')
    .update({ state: 'posted', posted_by: actor.name || actor.email || '', posted_at: nowIso(), updated_at: nowIso() })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  const row = data as SchoolLedgerEntryRow
  await snapshotVersion({
    record_type: 'school_ledger_entries', record_id: id, action: 'post',
    snapshot: row as unknown as Record<string, unknown>,
    previous_snapshot: before as unknown as Record<string, unknown>,
    brand_id: row.brand_id, changed_by: actor.name || actor.email || '',
  })
  await auditEvent({
    actor, action: 'school_ledger.post', entity_table: 'school_ledger_entries', entity_id: id,
    before_data: before as unknown as Record<string, unknown>,
    after_data: row as unknown as Record<string, unknown>,
  })
  return row
}

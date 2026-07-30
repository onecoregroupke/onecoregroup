import { db } from '../serverClient'
import { postLedgerEntry, ensureChargeCategory, resolveSchoolBrandId, SCHOOL_STUDENT_TABLE } from '../schoolFinance'
import { parseSchoolLedger } from './parse/schoolLedger'
import type { ImportAdapter, CommitContext } from './framework'
import type { DataImportStagingRow, School, SchoolLedgerEntryType } from '@ocg/db'

/**
 * School student-ledger adapter (Rayyan / Rhythms). Pure parsing lives in
 * ./parse/schoolLedger (unit tested); this module handles the IO side:
 * duplicate signatures, student resolution, and committing/rolling back rows.
 */

/** Resolve a student by admission number within the school; create if absent
 *  (never merge on name similarity — a missing admission number is a NEW student). */
async function resolveOrCreateStudent(school: School, admissionNo: string, name: string): Promise<string | null> {
  if (!admissionNo) return null
  const table = SCHOOL_STUDENT_TABLE[school]
  // Dynamic table name — cast like the repo does for schema-flexible access.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = db() as any
  const { data: found } = await supabase.from(table).select('id').eq('admission_number', admissionNo).maybeSingle()
  if (found) return (found as { id: string }).id
  const { data: created, error } = await supabase
    .from(table)
    .insert({ full_name: name || admissionNo, admission_number: admissionNo, notes: 'Created via ledger import' })
    .select('id')
    .single()
  if (error) throw new Error(`Could not create student ${admissionNo}: ${error.message}`)
  return (created as { id: string }).id
}

export function makeSchoolLedgerAdapter(school: School): ImportAdapter {
  return {
    type: 'school-ledger',
    parse: (wb, opts) => parseSchoolLedger(wb, (opts.school as School) || school, opts.selectedSheets),
    signature: (m) => {
      const adm = String(m['student_admission_no'] ?? '')
      const date = String(m['entry_date'] ?? '')
      const amt = String(m['amount_ksh'] ?? '')
      const type = String(m['entry_type'] ?? '')
      const rct = String(m['receipt_no'] ?? '')
      const mpesa = String(m['mpesa_code'] ?? '')
      return [
        `${school}|${adm}|${date}|${amt}|${type}|${rct}`,
        `${school}|${adm}|${date}|${amt}|${type}|${mpesa}`,
      ].filter((s) => !s.endsWith('|'))
    },
    async commit(row: DataImportStagingRow, ctx: CommitContext) {
      const m = row.mapped_payload
      if (row.record_kind !== 'charge' && row.record_kind !== 'payment') return null
      const sch = (m['school'] as School) || school
      const brandId = ctx.brandId ?? (await resolveSchoolBrandId(sch))
      const studentId = await resolveOrCreateStudent(sch, String(m['student_admission_no'] ?? ''), String(m['student_name'] ?? ''))
      if (!studentId) throw new Error('No student to attach ledger entry to')
      const category = await ensureChargeCategory(sch, {
        name: String(m['category_label'] || 'General'),
        section: String(m['section'] ?? ''),
        brand_id: brandId,
      })
      const entry = await postLedgerEntry(
        {
          school: sch,
          brand_id: brandId,
          student_id: studentId,
          student_admission_no: String(m['student_admission_no'] ?? ''),
          category_id: category.id,
          category_label: String(m['category_label'] ?? ''),
          section: String(m['section'] ?? ''),
          entry_type: m['entry_type'] as SchoolLedgerEntryType,
          entry_date: String(m['entry_date'] || '') || undefined,
          academic_year: String(m['academic_year'] ?? ''),
          term: String(m['term'] ?? ''),
          description: String(m['description'] ?? ''),
          amount_ksh: Number(m['amount_ksh'] ?? 0),
          method: String(m['method'] ?? ''),
          receipt_no: String(m['receipt_no'] ?? ''),
          mpesa_code: String(m['mpesa_code'] ?? ''),
          source_balance: (m['source_balance'] as number | null) ?? null,
          source_workbook: ctx.school || row.sheet_name,
          source_sheet: row.sheet_name,
          source_row: Math.floor(row.source_row ?? 0) || null,
          import_id: ctx.importId,
          comment: String(m['comment'] ?? ''),
          state: 'posted',
        },
        ctx.allowed,
        ctx.actor,
      )
      return { target_table: 'school_ledger_entries', target_id: entry.id }
    },
    async rollbackRow(row: DataImportStagingRow) {
      if (!row.target_id) return false
      const supabase = db()
      const { data } = await supabase.from('school_ledger_entries').select('state').eq('id', row.target_id).maybeSingle()
      if (!data) return false
      await supabase.from('school_ledger_entries').delete().eq('id', row.target_id).eq('import_id', row.import_id)
      return true
    },
  }
}

import { db } from './serverClient'
import type { School } from '@ocg/db'

// Server-side school-fee rollups (migration 050 RPCs). Aggregation happens in
// Postgres so we never pull tens of thousands of ledger rows to the app.

export interface SchoolFeeTotals { charged: number; paid: number; outstanding: number; students: number }
export interface SchoolFeeCategory { category_label: string; charged: number; paid: number; balance: number }
export interface SchoolFeeMonth { ym: string; charged: number; paid: number }
export interface SchoolFeeDebtor { student_id: string; admission_no: string; outstanding: number }

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db().rpc as any)(fn, args)
  return (data as T[] | null) ?? []
}
const N = (v: unknown) => Number(v ?? 0) || 0

export async function schoolFeeTotals(school: School): Promise<SchoolFeeTotals> {
  const r = (await rpc<Record<string, unknown>>('school_fee_totals', { p_school: school }))[0] ?? {}
  return { charged: N(r.charged), paid: N(r.paid), outstanding: N(r.outstanding), students: N(r.students) }
}

export async function schoolFeeByCategory(school: School): Promise<SchoolFeeCategory[]> {
  return (await rpc<Record<string, unknown>>('school_fee_by_category', { p_school: school }))
    .map((r) => ({ category_label: String(r.category_label ?? 'General'), charged: N(r.charged), paid: N(r.paid), balance: N(r.balance) }))
}

export async function schoolFeeByMonth(school: School): Promise<SchoolFeeMonth[]> {
  return (await rpc<Record<string, unknown>>('school_fee_by_month', { p_school: school }))
    .map((r) => ({ ym: String(r.ym ?? ''), charged: N(r.charged), paid: N(r.paid) }))
}

export async function schoolFeeTopDebtors(school: School, limit = 15): Promise<SchoolFeeDebtor[]> {
  return (await rpc<Record<string, unknown>>('school_fee_top_debtors', { p_school: school, p_limit: limit }))
    .map((r) => ({ student_id: String(r.student_id ?? ''), admission_no: String(r.admission_no ?? ''), outstanding: N(r.outstanding) }))
}

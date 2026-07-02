import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { db } from '@/lib/serverClient'
import type { RhythmsStudentRow } from '@ocg/db'

type ImportRow = Record<string, string | number | null | undefined>

const CODE_KEYS = ['schoolpay_code', 'schoolpay code', 'paybill code', 'student code', 'code']
const ADMISSION_KEYS = ['admission_number', 'admission number', 'admission no', 'adm no', 'adm']
const NAME_KEYS = ['student_name', 'student name', 'name', 'learner name', 'full_name']
const FEE_KEYS = ['fee_item', 'fee item', 'item', 'description', 'fee']
const EXPECTED_KEYS = ['amount_expected_ksh', 'expected', 'amount expected', 'bill amount', 'invoice amount']
const PAID_KEYS = ['amount_paid_ksh', 'paid', 'amount paid', 'paid amount', 'payment amount']
const BALANCE_KEYS = ['balance_ksh', 'balance', 'outstanding', 'amount due']
const STATUS_KEYS = ['payment_status', 'payment status', 'status']

export async function POST(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  if (!actor.can('rhythms_admin', 'edit')) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })

  try {
    const body = await req.json()
    const rows = Array.isArray(body?.rows) ? (body.rows as ImportRow[]) : []
    if (rows.length === 0) return NextResponse.json({ ok: false, error: 'No rows to import.' }, { status: 400 })

    const supabase = db()
    const { data: studentsData } = await supabase.from('rhythms_students').select('*')
    const students = (studentsData as RhythmsStudentRow[] | null) ?? []
    const studentByCode = new Map(students.filter((s) => s.schoolpay_code).map((s) => [norm(s.schoolpay_code), s]))
    const studentByAdmission = new Map(students.filter((s) => s.admission_number).map((s) => [norm(s.admission_number), s]))
    const studentByName = new Map(students.map((s) => [norm(s.full_name), s]))

    const { data: batch, error: batchError } = await supabase
      .from('rhythms_schoolpay_import_batches')
      .insert({
        source_label: body?.source_label || 'SchoolPay export',
        imported_by: actor.email || actor.userId,
        row_count: rows.length,
        notes: body?.notes ?? '',
        metadata: { uploadedAt: new Date().toISOString() },
      })
      .select('*')
      .single()
    if (batchError || !batch) throw new Error(batchError?.message ?? 'Failed to create import batch')

    const snapshots = rows.map((row) => {
      const schoolpayCode = pick(row, CODE_KEYS)
      const admissionNumber = pick(row, ADMISSION_KEYS)
      const studentName = pick(row, NAME_KEYS)
      const student =
        studentByCode.get(norm(schoolpayCode)) ??
        studentByAdmission.get(norm(admissionNumber)) ??
        studentByName.get(norm(studentName))
      const expected = money(pick(row, EXPECTED_KEYS))
      const paid = money(pick(row, PAID_KEYS))
      const balance = pick(row, BALANCE_KEYS) ? money(pick(row, BALANCE_KEYS)) : expected - paid
      return {
        batch_id: batch.id,
        student_id: student?.id ?? null,
        schoolpay_code: schoolpayCode || student?.schoolpay_code || '',
        admission_number: admissionNumber || student?.admission_number || '',
        student_name: studentName || student?.full_name || '',
        fee_item: pick(row, FEE_KEYS),
        amount_expected_ksh: expected,
        amount_paid_ksh: paid,
        balance_ksh: balance,
        payment_status: pick(row, STATUS_KEYS) || inferStatus(balance),
        raw_payload: row,
      }
    })

    const { error: insertError } = await supabase.from('rhythms_schoolpay_payment_snapshots').insert(snapshots)
    if (insertError) throw new Error(insertError.message)

    const matched = snapshots.filter((s) => s.student_id).length
    return NextResponse.json({
      ok: true,
      batch,
      imported: snapshots.length,
      matched,
      unmatched: snapshots.length - matched,
      followups: snapshots.filter((s) => Number(s.balance_ksh ?? 0) > 0).length,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

function pick(row: ImportRow, keys: string[]): string {
  const normalized = new Map(Object.entries(row).map(([key, value]) => [norm(key), value]))
  for (const key of keys) {
    const value = normalized.get(norm(key))
    if (value != null && String(value).trim()) return String(value).trim()
  }
  return ''
}

function money(value: string): number {
  const cleaned = String(value ?? '').replace(/[^0-9.-]/g, '')
  if (!cleaned) return 0
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

function norm(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase()
}

function inferStatus(balance: number): string {
  if (balance <= 0) return 'paid'
  return 'balance due'
}

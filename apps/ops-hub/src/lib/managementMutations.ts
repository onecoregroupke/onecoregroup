import { db, nowIso } from './serverClient'
import type { Database, SectionKey } from '@ocg/db'

type TableName = keyof Database['public']['Tables']
type Json = Record<string, unknown>

const TYPE_TABLE = {
  approval: 'ocg_approvals',
  blocker: 'ocg_blockers',
  meeting: 'ocg_meetings',
  decision: 'ocg_decisions',
  recurring: 'ocg_recurring_tasks',
  finance_account: 'finance_accounts',
  finance_transaction: 'finance_transactions',
  finance_transfer: 'finance_interbrand_transfers',
  finance_reconciliation_batch: 'finance_reconciliation_batches',
  finance_reconciliation_match: 'finance_reconciliation_matches',
  finance_exception: 'finance_exceptions',
  npt_customer: 'npt_customers',
  npt_piano: 'npt_pianos',
  npt_job: 'npt_service_jobs',
  npt_reminder: 'npt_reminders',
  npt_quote: 'npt_quote_invoice_records',
  npt_contact: 'npt_contacts',
  npt_appointment: 'npt_appointments',
  npt_measurement: 'npt_piano_measurements',
  npt_timeline: 'npt_timeline_events',
  rayyan_guardian: 'rayyan_guardians',
  rayyan_student: 'rayyan_students',
  rayyan_admission: 'rayyan_admissions',
  rayyan_fee_followup: 'rayyan_fee_followups',
  rayyan_fee_invoice: 'rayyan_fee_invoices',
  rayyan_fee_payment: 'rayyan_fee_payments',
  rayyan_class: 'rayyan_classes',
  rayyan_admin_task: 'rayyan_admin_tasks',
  rhythms_student: 'rhythms_students',
  rhythms_guardian: 'rhythms_guardians',
  rhythms_class: 'rhythms_classes',
  rhythms_admission: 'rhythms_admissions',
  rhythms_fee_followup: 'rhythms_fee_followups',
  rhythms_fee_invoice: 'rhythms_fee_invoices',
  rhythms_fee_payment: 'rhythms_fee_payments',
  rhythms_admin_task: 'rhythms_admin_tasks',
  darul_guardian: 'darul_guardians',
  darul_class: 'darul_classes',
  darul_student: 'darul_students',
  darul_admission: 'darul_admissions',
  darul_hifz: 'darul_hifz_progress',
  darul_attendance: 'darul_attendance_notes',
  darul_fee_invoice: 'darul_fee_invoices',
  darul_fee_payment: 'darul_fee_payments',
  darul_fee_followup: 'darul_fee_followups',
  darul_admin_task: 'darul_admin_tasks',
} as const satisfies Record<string, TableName>

export type MutationType = keyof typeof TYPE_TABLE

/** The permission section that governs a managed-row mutation, derived from the
 *  type prefix. Used by the /api/{management,finance,npt,rayyan,rhythms,darul}
 *  routes to authorize each write against the correct module — so e.g. a
 *  finance_* write requires `finance` edit regardless of which route received it. */
export function sectionForMutationType(type: MutationType): SectionKey {
  if (type.startsWith('finance_')) return 'finance'
  if (type.startsWith('npt_')) return 'npt_service'
  if (type.startsWith('rayyan_')) return 'rayyan_admin'
  if (type.startsWith('rhythms_')) return 'rhythms_admin'
  if (type.startsWith('darul_')) return 'darul_admin'
  return 'management' // approval | blocker | meeting | decision | recurring
}

const ALLOWED_FIELDS: Record<MutationType, string[]> = {
  approval: ['brand_id', 'related_task_id', 'related_project_id', 'approval_type', 'title', 'description', 'requested_by', 'approver_id', 'status', 'priority', 'due_date', 'decision_notes'],
  blocker: ['brand_id', 'task_id', 'project_id', 'title', 'description', 'blocker_type', 'severity', 'owner_id', 'escalation_owner_id', 'status', 'next_action', 'blocked_since', 'resolved_at'],
  meeting: ['brand_id', 'title', 'meeting_date', 'attendees', 'notes', 'summary', 'created_by'],
  decision: ['brand_id', 'project_id', 'meeting_id', 'title', 'decision', 'owner_id', 'due_date', 'status'],
  recurring: ['brand_id', 'title', 'description', 'recurrence_rule', 'default_assignee_id', 'department', 'priority', 'next_run_at', 'is_active'],
  finance_account: ['brand_id', 'account_name', 'account_type', 'provider', 'account_identifier', 'legal_owner', 'owner_person', 'business_use_notes', 'opening_balance_ksh', 'current_balance_ksh', 'reconciliation_status', 'is_active', 'notes'],
  finance_transaction: ['brand_id', 'account_id', 'counterparty_brand_id', 'transaction_date', 'direction', 'category', 'description', 'amount_ksh', 'payment_channel', 'reference', 'counterparty_name', 'owner_person', 'reconciliation_status', 'source_document_url', 'notes'],
  finance_transfer: ['from_brand_id', 'to_brand_id', 'from_account_id', 'to_account_id', 'transfer_date', 'amount_ksh', 'purpose', 'reference', 'status', 'recorded_by', 'notes'],
  finance_reconciliation_batch: ['account_id', 'brand_id', 'period_start', 'period_end', 'statement_source', 'statement_reference', 'opening_balance_ksh', 'closing_balance_ksh', 'imported_count', 'matched_count', 'exception_count', 'status', 'reviewed_by', 'notes'],
  finance_reconciliation_match: ['batch_id', 'transaction_id', 'statement_date', 'statement_description', 'statement_amount_ksh', 'statement_reference', 'match_status', 'confidence', 'notes'],
  finance_exception: ['brand_id', 'account_id', 'transaction_id', 'transfer_id', 'exception_type', 'severity', 'title', 'description', 'owner_id', 'status', 'due_date', 'resolution_notes'],
  npt_customer: ['full_name', 'phone', 'email', 'location', 'area_estate', 'customer_type', 'lead_source', 'preferred_communication_channel', 'notes', 'last_contacted_at', 'next_follow_up_date', 'company_name', 'preferred_technician_id', 'referred_by', 'tax_exempt', 'tags'],
  npt_piano: ['customer_id', 'make', 'model', 'serial_number', 'piano_type', 'location', 'condition', 'last_tuning_date', 'last_repair_date', 'recommended_next_service_date', 'technician_notes', 'sales_status', 'tuning_interval_months', 'tags'],
  npt_contact: ['customer_id', 'name', 'phone', 'email', 'role', 'is_primary', 'is_billing', 'notes'],
  npt_appointment: ['customer_id', 'piano_id', 'technician_id', 'service_job_id', 'title', 'location', 'start_at', 'end_at', 'status', 'notes', 'created_by'],
  npt_measurement: ['piano_id', 'technician_id', 'measured_at', 'temperature_c', 'humidity_pct', 'notes'],
  npt_timeline: ['customer_id', 'piano_id', 'appointment_id', 'event_type', 'title', 'body', 'actor', 'occurred_at'],
  npt_job: ['customer_id', 'piano_id', 'ops_task_id', 'service_type', 'requested_date', 'scheduled_at', 'technician_id', 'location', 'job_notes', 'internal_notes', 'customer_facing_notes', 'status', 'priority', 'estimated_cost_ksh', 'final_cost_ksh', 'required_tools', 'completion_summary'],
  npt_reminder: ['customer_id', 'piano_id', 'service_job_id', 'reminder_type', 'title', 'due_at', 'channel', 'status', 'notes'],
  npt_quote: ['customer_id', 'service_job_id', 'record_type', 'quote_amount_ksh', 'invoice_amount_ksh', 'status', 'payment_status', 'sent_date', 'paid_date', 'notes'],
  rayyan_guardian: ['full_name', 'phone', 'email', 'relationship_to_child', 'preferred_communication_channel', 'notes'],
  rayyan_student: ['full_name', 'admission_number', 'schoolpay_code', 'class_level', 'guardian_id', 'enrollment_status', 'start_date', 'notes'],
  rayyan_admission: ['student_id', 'guardian_id', 'pipeline_status', 'source', 'tour_date', 'documents_status', 'schoolpay_status', 'next_follow_up_date', 'notes'],
  rayyan_fee_followup: ['student_id', 'schoolpay_code', 'expected_fee_item', 'follow_up_status', 'parent_contacted_date', 'last_known_fee_status', 'next_follow_up_date', 'notes'],
  rayyan_fee_invoice: ['student_id', 'schoolpay_snapshot_id', 'schoolpay_code', 'fee_item', 'term', 'amount_expected_ksh', 'amount_paid_ksh', 'status', 'due_date', 'notes'],
  rayyan_fee_payment: ['invoice_id', 'student_id', 'schoolpay_snapshot_id', 'amount_ksh', 'method', 'reference', 'paid_on', 'recorded_by', 'notes'],
  rayyan_class: ['name', 'level', 'teacher_id', 'notes', 'is_active'],
  rayyan_admin_task: ['student_id', 'guardian_id', 'ops_task_id', 'task_type', 'title', 'status', 'priority', 'due_date', 'notes'],
  rhythms_student: ['full_name', 'admission_number', 'schoolpay_code', 'programme', 'cohort', 'guardian_name', 'guardian_id', 'class_id', 'phone', 'email', 'enrollment_status', 'start_date', 'notes'],
  rhythms_guardian: ['full_name', 'phone', 'email', 'relationship_to_child', 'preferred_communication_channel', 'notes'],
  rhythms_class: ['name', 'level', 'teacher_id', 'notes', 'is_active'],
  rhythms_admission: ['student_id', 'guardian_id', 'pipeline_status', 'source', 'tour_date', 'documents_status', 'schoolpay_status', 'next_follow_up_date', 'notes'],
  rhythms_fee_followup: ['student_id', 'schoolpay_code', 'expected_fee_item', 'follow_up_status', 'parent_contacted_date', 'last_known_fee_status', 'next_follow_up_date', 'notes'],
  rhythms_fee_invoice: ['student_id', 'schoolpay_snapshot_id', 'schoolpay_code', 'fee_item', 'term', 'amount_expected_ksh', 'amount_paid_ksh', 'status', 'due_date', 'notes'],
  rhythms_fee_payment: ['invoice_id', 'student_id', 'schoolpay_snapshot_id', 'amount_ksh', 'method', 'reference', 'paid_on', 'recorded_by', 'notes'],
  rhythms_admin_task: ['student_id', 'guardian_id', 'ops_task_id', 'task_type', 'title', 'status', 'priority', 'due_date', 'notes'],
  darul_guardian: ['full_name', 'phone', 'email', 'relationship_to_child', 'preferred_communication_channel', 'notes'],
  darul_class: ['name', 'level', 'teacher_id', 'notes', 'is_active'],
  darul_student: ['full_name', 'admission_number', 'guardian_id', 'class_id', 'halaqa_level', 'hifz_juz_completed', 'current_surah', 'enrollment_status', 'start_date', 'notes'],
  darul_admission: ['student_id', 'guardian_id', 'pipeline_status', 'source', 'tour_date', 'documents_status', 'next_follow_up_date', 'notes'],
  darul_hifz: ['student_id', 'juz_number', 'surah', 'ayah_range', 'status', 'assessed_on', 'assessor_id', 'notes'],
  darul_attendance: ['student_id', 'class_id', 'attendance_date', 'status', 'notes', 'created_by'],
  darul_fee_invoice: ['student_id', 'fee_item', 'term', 'amount_expected_ksh', 'amount_paid_ksh', 'status', 'due_date', 'notes'],
  darul_fee_payment: ['invoice_id', 'student_id', 'amount_ksh', 'method', 'reference', 'paid_on', 'recorded_by', 'notes'],
  darul_fee_followup: ['student_id', 'expected_fee_item', 'follow_up_status', 'parent_contacted_date', 'last_known_fee_status', 'next_follow_up_date', 'notes'],
  darul_admin_task: ['student_id', 'guardian_id', 'ops_task_id', 'task_type', 'title', 'status', 'priority', 'due_date', 'notes'],
}

const REQUIRED_FIELD: Partial<Record<MutationType, string>> = {
  approval: 'title',
  blocker: 'title',
  meeting: 'title',
  decision: 'title',
  recurring: 'title',
  finance_account: 'account_name',
  finance_exception: 'title',
  npt_customer: 'full_name',
  npt_reminder: 'title',
  npt_contact: 'name',
  rayyan_guardian: 'full_name',
  rayyan_student: 'full_name',
  rayyan_class: 'name',
  rayyan_admin_task: 'title',
  rhythms_student: 'full_name',
  rhythms_guardian: 'full_name',
  rhythms_class: 'name',
  rhythms_admin_task: 'title',
  darul_guardian: 'full_name',
  darul_class: 'name',
  darul_student: 'full_name',
  darul_admin_task: 'title',
}

const UUID_FIELDS = new Set([
  'brand_id',
  'approver_id',
  'owner_id',
  'escalation_owner_id',
  'default_assignee_id',
  'customer_id',
  'piano_id',
  'service_job_id',
  'technician_id',
  'guardian_id',
  'student_id',
  'class_id',
  'teacher_id',
  'meeting_id',
  'invoice_id',
  'schoolpay_snapshot_id',
  'assessor_id',
  'preferred_technician_id',
  'appointment_id',
  'account_id',
  'counterparty_brand_id',
  'from_brand_id',
  'to_brand_id',
  'from_account_id',
  'to_account_id',
  'batch_id',
  'transaction_id',
  'transfer_id',
])

const NUMBER_FIELDS = new Set([
  'estimated_cost_ksh', 'final_cost_ksh', 'quote_amount_ksh', 'invoice_amount_ksh',
  'amount_expected_ksh', 'amount_paid_ksh', 'amount_ksh', 'hifz_juz_completed', 'juz_number',
  'temperature_c', 'humidity_pct', 'tuning_interval_months',
  'opening_balance_ksh', 'current_balance_ksh', 'imported_count', 'matched_count', 'exception_count',
  'closing_balance_ksh', 'statement_amount_ksh', 'confidence',
])

const ARRAY_FIELDS = new Set(['attendees', 'required_tools', 'tags'])

const BOOLEAN_FIELDS = new Set(['is_primary', 'is_billing', 'tax_exempt', 'is_active'])

const TABLES_WITH_UPDATED_AT = new Set<TableName>([
  'ocg_approvals',
  'ocg_blockers',
  'ocg_meetings',
  'ocg_decisions',
  'ocg_recurring_tasks',
  'finance_accounts',
  'finance_transactions',
  'finance_interbrand_transfers',
  'finance_reconciliation_batches',
  'finance_reconciliation_matches',
  'finance_exceptions',
  'npt_customers',
  'npt_pianos',
  'npt_service_jobs',
  'npt_quote_invoice_records',
  'npt_reminders',
  'npt_contacts',
  'npt_appointments',
  'rayyan_guardians',
  'rayyan_students',
  'rayyan_admissions',
  'rayyan_fee_followups',
  'rayyan_fee_invoices',
  'rayyan_classes',
  'rayyan_admin_tasks',
  'rhythms_students',
  'rhythms_guardians',
  'rhythms_classes',
  'rhythms_admissions',
  'rhythms_fee_followups',
  'rhythms_fee_invoices',
  'rhythms_admin_tasks',
  'darul_guardians',
  'darul_classes',
  'darul_students',
  'darul_admissions',
  'darul_fee_invoices',
  'darul_fee_followups',
  'darul_admin_tasks',
])

export function tableForType(type: string): TableName {
  const table = TYPE_TABLE[type as MutationType]
  if (!table) throw new Error(`Unsupported mutation type: ${type}`)
  return table
}

export function sanitizeValues(type: MutationType, values: Json): Json {
  const allowed = new Set(ALLOWED_FIELDS[type])
  const out: Json = {}
  for (const [key, raw] of Object.entries(values)) {
    if (!allowed.has(key)) continue
    if (raw === undefined) continue
    if (raw === '' && UUID_FIELDS.has(key)) {
      out[key] = null
      continue
    }
    if (raw === '' && NUMBER_FIELDS.has(key)) {
      out[key] = null
      continue
    }
    if (NUMBER_FIELDS.has(key)) {
      out[key] = raw == null ? null : Number(raw)
      continue
    }
    if (ARRAY_FIELDS.has(key)) {
      out[key] = Array.isArray(raw)
        ? raw
        : String(raw)
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
      continue
    }
    if (BOOLEAN_FIELDS.has(key)) {
      out[key] = raw === true || raw === 'true' || raw === 'on' || raw === '1'
      continue
    }
    out[key] = raw
  }
  const required = REQUIRED_FIELD[type]
  if (required && !String(out[required] ?? '').trim()) {
    throw new Error(`${required} is required`)
  }
  return out
}

export async function insertManagedRow(type: MutationType, values: Json) {
  const table = tableForType(type)
  const row = sanitizeValues(type, values)
  const { data, error } = await db().from(table).insert(row).select('*').single()
  if (error) throw new Error(error.message)
  return data
}

export async function updateManagedRow(type: MutationType, id: string, values: Json) {
  if (!id) throw new Error('id is required')
  const table = tableForType(type)
  const patch = sanitizeValues(type, values)
  if (TABLES_WITH_UPDATED_AT.has(table)) patch.updated_at = nowIso()
  const { data, error } = await db().from(table).update(patch).eq('id', id).select('*').single()
  if (error) throw new Error(error.message)
  return data
}

export async function completeNptJob(
  id: string,
  values: {
    completion_summary?: string
    final_cost_ksh?: number | string | null
    recommendations?: string
    next_service_date?: string | null
    technician_id?: string | null
  },
) {
  const supabase = db()
  const { data: job, error: jobError } = await supabase
    .from('npt_service_jobs')
    .select('*')
    .eq('id', id)
    .single()
  if (jobError || !job) throw new Error(jobError?.message ?? 'Job not found')

  const finalCost = values.final_cost_ksh === '' || values.final_cost_ksh == null ? null : Number(values.final_cost_ksh)
  const { data, error } = await supabase
    .from('npt_service_jobs')
    .update({
      status: 'Completed',
      completion_summary: values.completion_summary ?? job.completion_summary ?? '',
      final_cost_ksh: finalCost,
      technician_id: values.technician_id || job.technician_id,
      updated_at: nowIso(),
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)

  const { error: historyError } = await supabase.from('npt_service_history').insert({
    customer_id: job.customer_id,
    piano_id: job.piano_id,
    service_job_id: job.id,
    technician_id: values.technician_id || job.technician_id,
    service_date: nowIso().slice(0, 10),
    work_done: values.completion_summary ?? job.completion_summary ?? '',
    recommendations: values.recommendations ?? '',
    next_service_date: values.next_service_date || null,
  })
  if (historyError) throw new Error(historyError.message)

  if (job.piano_id && values.next_service_date) {
    await supabase
      .from('npt_pianos')
      .update({
        last_tuning_date: nowIso().slice(0, 10),
        recommended_next_service_date: values.next_service_date,
        updated_at: nowIso(),
      })
      .eq('id', job.piano_id)
  }

  return data
}

/**
 * Record a manual Darul Swafa fee payment (M-Pesa / cash / bank) and roll it up
 * into its invoice: recompute amount_paid_ksh from all payments and set the
 * invoice status (paid / partial / unpaid). SchoolPay is not used here.
 */
export async function recordDarulFeePayment(values: Record<string, unknown>) {
  return recordFeePayment({
    values,
    paymentType: 'darul_fee_payment',
    invoiceTable: 'darul_fee_invoices',
    paymentTable: 'darul_fee_payments',
  })
}

export async function recordRayyanFeePayment(values: Record<string, unknown>) {
  return recordFeePayment({
    values,
    paymentType: 'rayyan_fee_payment',
    invoiceTable: 'rayyan_fee_invoices',
    paymentTable: 'rayyan_fee_payments',
  })
}

export async function recordRhythmsFeePayment(values: Record<string, unknown>) {
  return recordFeePayment({
    values,
    paymentType: 'rhythms_fee_payment',
    invoiceTable: 'rhythms_fee_invoices',
    paymentTable: 'rhythms_fee_payments',
  })
}

async function recordFeePayment({
  values,
  paymentType,
  invoiceTable,
  paymentTable,
}: {
  values: Record<string, unknown>
  paymentType: MutationType
  invoiceTable: TableName
  paymentTable: TableName
}) {
  const supabase = db()
  const row = sanitizeValues(paymentType, values)
  if (!row.invoice_id) throw new Error('invoice_id is required')
  if (row.amount_ksh == null || Number(row.amount_ksh) <= 0) throw new Error('amount_ksh must be greater than 0')

  const { data: invoice, error: invErr } = await supabase
    .from(invoiceTable)
    .select('*')
    .eq('id', row.invoice_id as string)
    .single()
  if (invErr || !invoice) throw new Error(invErr?.message ?? 'Invoice not found')

  // Inherit the student from the invoice when not supplied.
  if (!row.student_id && invoice.student_id) row.student_id = invoice.student_id

  const { data: payment, error: payErr } = await supabase
    .from(paymentTable)
    .insert(row)
    .select('*')
    .single()
  if (payErr) throw new Error(payErr.message)

  const { data: payments } = await supabase
    .from(paymentTable)
    .select('amount_ksh')
    .eq('invoice_id', row.invoice_id as string)
  const paid = (payments ?? []).reduce((sum, p) => sum + Number(p.amount_ksh ?? 0), 0)
  const expected = Number(invoice.amount_expected_ksh ?? 0)
  const status = paid <= 0 ? 'unpaid' : paid >= expected && expected > 0 ? 'paid' : 'partial'

  await supabase
    .from(invoiceTable)
    .update({ amount_paid_ksh: paid, status, updated_at: nowIso() })
    .eq('id', row.invoice_id as string)

  return payment
}

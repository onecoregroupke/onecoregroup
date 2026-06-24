import { db, nowIso } from './serverClient'
import type { Database } from '@ocg/db'

type TableName = keyof Database['public']['Tables']
type Json = Record<string, unknown>

const TYPE_TABLE = {
  approval: 'ocg_approvals',
  blocker: 'ocg_blockers',
  meeting: 'ocg_meetings',
  decision: 'ocg_decisions',
  recurring: 'ocg_recurring_tasks',
  npt_customer: 'npt_customers',
  npt_piano: 'npt_pianos',
  npt_job: 'npt_service_jobs',
  npt_reminder: 'npt_reminders',
  npt_quote: 'npt_quote_invoice_records',
  rayyan_guardian: 'rayyan_guardians',
  rayyan_student: 'rayyan_students',
  rayyan_admission: 'rayyan_admissions',
  rayyan_fee_followup: 'rayyan_fee_followups',
  rayyan_class: 'rayyan_classes',
  rayyan_admin_task: 'rayyan_admin_tasks',
  rhythms_student: 'rhythms_students',
} as const satisfies Record<string, TableName>

export type MutationType = keyof typeof TYPE_TABLE

const ALLOWED_FIELDS: Record<MutationType, string[]> = {
  approval: ['brand_id', 'related_task_id', 'related_project_id', 'approval_type', 'title', 'description', 'requested_by', 'approver_id', 'status', 'priority', 'due_date', 'decision_notes'],
  blocker: ['brand_id', 'task_id', 'project_id', 'title', 'description', 'blocker_type', 'severity', 'owner_id', 'escalation_owner_id', 'status', 'next_action', 'blocked_since', 'resolved_at'],
  meeting: ['brand_id', 'title', 'meeting_date', 'attendees', 'notes', 'summary', 'created_by'],
  decision: ['brand_id', 'project_id', 'meeting_id', 'title', 'decision', 'owner_id', 'due_date', 'status'],
  recurring: ['brand_id', 'title', 'description', 'recurrence_rule', 'default_assignee_id', 'department', 'priority', 'next_run_at', 'is_active'],
  npt_customer: ['full_name', 'phone', 'email', 'location', 'area_estate', 'customer_type', 'lead_source', 'preferred_communication_channel', 'notes', 'last_contacted_at', 'next_follow_up_date'],
  npt_piano: ['customer_id', 'make', 'model', 'serial_number', 'piano_type', 'location', 'condition', 'last_tuning_date', 'last_repair_date', 'recommended_next_service_date', 'technician_notes', 'sales_status'],
  npt_job: ['customer_id', 'piano_id', 'ops_task_id', 'service_type', 'requested_date', 'scheduled_at', 'technician_id', 'location', 'job_notes', 'internal_notes', 'customer_facing_notes', 'status', 'priority', 'estimated_cost_ksh', 'final_cost_ksh', 'required_tools', 'completion_summary'],
  npt_reminder: ['customer_id', 'piano_id', 'service_job_id', 'reminder_type', 'title', 'due_at', 'channel', 'status', 'notes'],
  npt_quote: ['customer_id', 'service_job_id', 'record_type', 'quote_amount_ksh', 'invoice_amount_ksh', 'status', 'payment_status', 'sent_date', 'paid_date', 'notes'],
  rayyan_guardian: ['full_name', 'phone', 'email', 'relationship_to_child', 'preferred_communication_channel', 'notes'],
  rayyan_student: ['full_name', 'admission_number', 'schoolpay_code', 'class_level', 'guardian_id', 'enrollment_status', 'start_date', 'notes'],
  rayyan_admission: ['student_id', 'guardian_id', 'pipeline_status', 'source', 'tour_date', 'documents_status', 'schoolpay_status', 'next_follow_up_date', 'notes'],
  rayyan_fee_followup: ['student_id', 'schoolpay_code', 'expected_fee_item', 'follow_up_status', 'parent_contacted_date', 'last_known_fee_status', 'next_follow_up_date', 'notes'],
  rayyan_class: ['name', 'level', 'teacher_id', 'notes', 'is_active'],
  rayyan_admin_task: ['student_id', 'guardian_id', 'ops_task_id', 'task_type', 'title', 'status', 'priority', 'due_date', 'notes'],
  rhythms_student: ['full_name', 'admission_number', 'schoolpay_code', 'programme', 'cohort', 'guardian_name', 'phone', 'email', 'enrollment_status', 'start_date', 'notes'],
}

const REQUIRED_FIELD: Partial<Record<MutationType, string>> = {
  approval: 'title',
  blocker: 'title',
  meeting: 'title',
  decision: 'title',
  recurring: 'title',
  npt_customer: 'full_name',
  npt_reminder: 'title',
  rayyan_guardian: 'full_name',
  rayyan_student: 'full_name',
  rayyan_class: 'name',
  rayyan_admin_task: 'title',
  rhythms_student: 'full_name',
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
])

const NUMBER_FIELDS = new Set(['estimated_cost_ksh', 'final_cost_ksh', 'quote_amount_ksh', 'invoice_amount_ksh'])

const ARRAY_FIELDS = new Set(['attendees', 'required_tools'])

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
  const patch = { ...sanitizeValues(type, values), updated_at: nowIso() }
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

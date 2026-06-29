import { db, todayInEat } from './serverClient'
import { listBrands } from './brands'
import { listProjects } from './projects'
import { listTasks } from './tasks'
import { listTeam } from './team'
import { isActiveStatus } from './taskStatuses'
import type {
  Brand,
  MarketingCampaignRow,
  MarketingContentRow,
  NptReminderRow,
  NptServiceJobRow,
  OcgApprovalRow,
  OcgBlockerRow,
  OcgDecisionRow,
  OcgRecurringTaskRow,
  OpsCompletionRecordRow,
  OpsProjectRow,
  OpsTaskRow,
  OpsTeamMemberRow,
  FinanceAccountRow,
  FinanceExceptionRow,
  FinanceInterbrandTransferRow,
  FinanceReconciliationBatchRow,
  FinanceReconciliationMatchRow,
  FinanceTransactionRow,
  RayyanAdmissionRow,
  RayyanAdminTaskRow,
  RayyanFeeInvoiceRow,
  RayyanFeeFollowupRow,
  RayyanFeePaymentRow,
  RayyanSchoolpayPaymentSnapshotRow,
  NptQuoteInvoiceRow,
  RayyanStudentRow,
  RhythmsSchoolpayImportBatchRow,
  RhythmsFeeInvoiceRow,
  RhythmsFeePaymentRow,
  RhythmsSchoolpayPaymentSnapshotRow,
  RhythmsStudentRow,
  DarulStudentRow,
  DarulAdmissionRow,
  DarulFeeInvoiceRow,
  DarulFeePaymentRow,
  DarulFeeFollowupRow,
  DarulAdminTaskRow,
  DarulHifzProgressRow,
} from '@ocg/db'

export type ManagementData = {
  today: string
  brands: Brand[]
  projects: OpsProjectRow[]
  tasks: OpsTaskRow[]
  team: OpsTeamMemberRow[]
  completions: OpsCompletionRecordRow[]
  approvals: OcgApprovalRow[]
  blockers: OcgBlockerRow[]
  decisions: OcgDecisionRow[]
  recurring: OcgRecurringTaskRow[]
  marketingContent: MarketingContentRow[]
  marketingCampaigns: MarketingCampaignRow[]
  nptJobs: NptServiceJobRow[]
  nptReminders: NptReminderRow[]
  rayyanStudents: RayyanStudentRow[]
  rayyanAdmissions: RayyanAdmissionRow[]
  rayyanFeeFollowups: RayyanFeeFollowupRow[]
  rayyanAdminTasks: RayyanAdminTaskRow[]
  rayyanSchoolpaySnapshots: RayyanSchoolpayPaymentSnapshotRow[]
}

export async function safeRows<T>(
  table: keyof import('@ocg/db').Database['public']['Tables'],
  opts: { limit?: number; order?: string; ascending?: boolean } = {},
): Promise<T[]> {
  try {
    let q = db().from(table).select('*')
    if (opts.order) q = q.order(opts.order, { ascending: opts.ascending ?? false })
    if (opts.limit) q = q.limit(opts.limit)
    const { data, error } = await q
    if (error) {
      console.warn(`Management table read skipped for ${String(table)}: ${error.message}`)
      return []
    }
    return (data as T[] | null) ?? []
  } catch (error) {
    console.warn(`Management table read failed for ${String(table)}: ${(error as Error).message}`)
    return []
  }
}

export async function getNptServiceData() {
  const [customers, pianos, jobs, history, quoteInvoices, reminders, team] = await Promise.all([
    safeRows<import('@ocg/db').NptCustomerRow>('npt_customers', { limit: 500, order: 'created_at' }),
    safeRows<import('@ocg/db').NptPianoRow>('npt_pianos', { limit: 500, order: 'created_at' }),
    safeRows<NptServiceJobRow>('npt_service_jobs', { limit: 500, order: 'created_at' }),
    safeRows<import('@ocg/db').NptServiceHistoryRow>('npt_service_history', { limit: 500, order: 'service_date' }),
    safeRows<import('@ocg/db').NptQuoteInvoiceRow>('npt_quote_invoice_records', { limit: 500, order: 'created_at' }),
    safeRows<NptReminderRow>('npt_reminders', { limit: 500, order: 'due_at', ascending: true }),
    listTeam(),
  ])
  return { customers, pianos, jobs, history, quoteInvoices, reminders, team }
}

export async function getRayyanAdminData() {
  const [guardians, students, admissions, feeFollowups, invoices, payments, batches, snapshots, classes, attendance, adminTasks, team] = await Promise.all([
    safeRows<import('@ocg/db').RayyanGuardianRow>('rayyan_guardians', { limit: 500, order: 'created_at' }),
    safeRows<RayyanStudentRow>('rayyan_students', { limit: 500, order: 'created_at' }),
    safeRows<RayyanAdmissionRow>('rayyan_admissions', { limit: 500, order: 'created_at' }),
    safeRows<RayyanFeeFollowupRow>('rayyan_fee_followups', { limit: 500, order: 'next_follow_up_date', ascending: true }),
    safeRows<RayyanFeeInvoiceRow>('rayyan_fee_invoices', { limit: 1000, order: 'created_at' }),
    safeRows<RayyanFeePaymentRow>('rayyan_fee_payments', { limit: 1000, order: 'paid_on' }),
    safeRows<import('@ocg/db').RayyanSchoolpayImportBatchRow>('rayyan_schoolpay_import_batches', { limit: 100, order: 'imported_at' }),
    safeRows<RayyanSchoolpayPaymentSnapshotRow>('rayyan_schoolpay_payment_snapshots', { limit: 500, order: 'captured_at' }),
    safeRows<import('@ocg/db').RayyanClassRow>('rayyan_classes', { limit: 100, order: 'created_at' }),
    safeRows<import('@ocg/db').RayyanAttendanceNoteRow>('rayyan_attendance_notes', { limit: 500, order: 'attendance_date' }),
    safeRows<RayyanAdminTaskRow>('rayyan_admin_tasks', { limit: 500, order: 'due_date', ascending: true }),
    listTeam(),
  ])
  return { guardians, students, admissions, feeFollowups, invoices, payments, batches, snapshots, classes, attendance, adminTasks, team }
}

export async function getRhythmsAdminData() {
  const [students, batches, snapshots, invoices, payments, guardians, admissions, classes, feeFollowups, attendance, adminTasks, team] =
    await Promise.all([
      safeRows<RhythmsStudentRow>('rhythms_students', { limit: 500, order: 'created_at' }),
      safeRows<RhythmsSchoolpayImportBatchRow>('rhythms_schoolpay_import_batches', { limit: 100, order: 'imported_at' }),
      safeRows<RhythmsSchoolpayPaymentSnapshotRow>('rhythms_schoolpay_payment_snapshots', { limit: 500, order: 'captured_at' }),
      safeRows<RhythmsFeeInvoiceRow>('rhythms_fee_invoices', { limit: 1000, order: 'created_at' }),
      safeRows<RhythmsFeePaymentRow>('rhythms_fee_payments', { limit: 1000, order: 'paid_on' }),
      safeRows<import('@ocg/db').RhythmsGuardianRow>('rhythms_guardians', { limit: 500, order: 'created_at' }),
      safeRows<import('@ocg/db').RhythmsAdmissionRow>('rhythms_admissions', { limit: 500, order: 'created_at' }),
      safeRows<import('@ocg/db').RhythmsClassRow>('rhythms_classes', { limit: 100, order: 'created_at' }),
      safeRows<import('@ocg/db').RhythmsFeeFollowupRow>('rhythms_fee_followups', { limit: 500, order: 'next_follow_up_date', ascending: true }),
      safeRows<import('@ocg/db').RhythmsAttendanceNoteRow>('rhythms_attendance_notes', { limit: 500, order: 'attendance_date' }),
      safeRows<import('@ocg/db').RhythmsAdminTaskRow>('rhythms_admin_tasks', { limit: 500, order: 'due_date', ascending: true }),
      listTeam(),
    ])
  return { students, batches, snapshots, invoices, payments, guardians, admissions, classes, feeFollowups, attendance, adminTasks, team }
}

export async function getDarulAdminData() {
  const [guardians, students, admissions, classes, hifz, attendance, invoices, payments, feeFollowups, adminTasks, team] =
    await Promise.all([
      safeRows<import('@ocg/db').DarulGuardianRow>('darul_guardians', { limit: 500, order: 'created_at' }),
      safeRows<DarulStudentRow>('darul_students', { limit: 500, order: 'created_at' }),
      safeRows<DarulAdmissionRow>('darul_admissions', { limit: 500, order: 'created_at' }),
      safeRows<import('@ocg/db').DarulClassRow>('darul_classes', { limit: 100, order: 'created_at' }),
      safeRows<DarulHifzProgressRow>('darul_hifz_progress', { limit: 1000, order: 'updated_at' }),
      safeRows<import('@ocg/db').DarulAttendanceNoteRow>('darul_attendance_notes', { limit: 500, order: 'attendance_date' }),
      safeRows<DarulFeeInvoiceRow>('darul_fee_invoices', { limit: 1000, order: 'created_at' }),
      safeRows<DarulFeePaymentRow>('darul_fee_payments', { limit: 1000, order: 'paid_on' }),
      safeRows<DarulFeeFollowupRow>('darul_fee_followups', { limit: 500, order: 'next_follow_up_date', ascending: true }),
      safeRows<DarulAdminTaskRow>('darul_admin_tasks', { limit: 500, order: 'due_date', ascending: true }),
      listTeam(),
    ])
  return { guardians, students, admissions, classes, hifz, attendance, invoices, payments, feeFollowups, adminTasks, team }
}

export async function getFinanceData() {
  const [
    tasks,
    darulStudents,
    darulInvoices,
    darulPayments,
    rayyanStudents,
    rayyanInvoices,
    rayyanPayments,
    rayyanSnapshots,
    rhythmsStudents,
    rhythmsInvoices,
    rhythmsPayments,
    rhythmsSnapshots,
    nptInvoices,
    financeAccounts,
    financeTransactions,
    financeTransfers,
    financeBatches,
    financeMatches,
    financeExceptions,
    brands,
    team,
  ] = await Promise.all([
    listTasks({ limit: 1000 }),
    safeRows<DarulStudentRow>('darul_students', { limit: 500, order: 'created_at' }),
    safeRows<DarulFeeInvoiceRow>('darul_fee_invoices', { limit: 1000, order: 'created_at' }),
    safeRows<DarulFeePaymentRow>('darul_fee_payments', { limit: 1000, order: 'paid_on' }),
    safeRows<RayyanStudentRow>('rayyan_students', { limit: 500, order: 'created_at' }),
    safeRows<RayyanFeeInvoiceRow>('rayyan_fee_invoices', { limit: 1000, order: 'created_at' }),
    safeRows<RayyanFeePaymentRow>('rayyan_fee_payments', { limit: 1000, order: 'paid_on' }),
    safeRows<RayyanSchoolpayPaymentSnapshotRow>('rayyan_schoolpay_payment_snapshots', { limit: 1000, order: 'captured_at' }),
    safeRows<RhythmsStudentRow>('rhythms_students', { limit: 500, order: 'created_at' }),
    safeRows<RhythmsFeeInvoiceRow>('rhythms_fee_invoices', { limit: 1000, order: 'created_at' }),
    safeRows<RhythmsFeePaymentRow>('rhythms_fee_payments', { limit: 1000, order: 'paid_on' }),
    safeRows<RhythmsSchoolpayPaymentSnapshotRow>('rhythms_schoolpay_payment_snapshots', { limit: 1000, order: 'captured_at' }),
    safeRows<NptQuoteInvoiceRow>('npt_quote_invoice_records', { limit: 1000, order: 'created_at' }),
    safeRows<FinanceAccountRow>('finance_accounts', { limit: 500, order: 'created_at' }),
    safeRows<FinanceTransactionRow>('finance_transactions', { limit: 2000, order: 'transaction_date' }),
    safeRows<FinanceInterbrandTransferRow>('finance_interbrand_transfers', { limit: 1000, order: 'transfer_date' }),
    safeRows<FinanceReconciliationBatchRow>('finance_reconciliation_batches', { limit: 500, order: 'created_at' }),
    safeRows<FinanceReconciliationMatchRow>('finance_reconciliation_matches', { limit: 1000, order: 'created_at' }),
    safeRows<FinanceExceptionRow>('finance_exceptions', { limit: 500, order: 'due_date', ascending: true }),
    listBrands(),
    listTeam(),
  ])

  const financeTasks = tasks.filter((task) => {
    const haystack = `${task.task_name} ${task.task_description} ${task.category} ${task.notes}`.toLowerCase()
    return ['finance', 'fee', 'invoice', 'payment', 'schoolpay', 'reconcile', 'receipt'].some((word) => haystack.includes(word))
  })

  return {
    tasks: financeTasks,
    darul: { students: darulStudents, invoices: darulInvoices, payments: darulPayments },
    rayyan: { students: rayyanStudents, invoices: rayyanInvoices, payments: rayyanPayments, snapshots: rayyanSnapshots },
    rhythms: { students: rhythmsStudents, invoices: rhythmsInvoices, payments: rhythmsPayments, snapshots: rhythmsSnapshots },
    npt: { invoices: nptInvoices },
    finance: {
      accounts: financeAccounts,
      transactions: financeTransactions,
      transfers: financeTransfers,
      batches: financeBatches,
      matches: financeMatches,
      exceptions: financeExceptions,
    },
    brands,
    team,
  }
}

export async function getManagementData(): Promise<ManagementData> {
  const today = todayInEat()
  const [
    brands,
    projects,
    tasks,
    team,
    completions,
    approvals,
    blockers,
    decisions,
    recurring,
    marketingContent,
    marketingCampaigns,
    nptJobs,
    nptReminders,
    rayyanStudents,
    rayyanAdmissions,
    rayyanFeeFollowups,
    rayyanAdminTasks,
    rayyanSchoolpaySnapshots,
  ] = await Promise.all([
    listBrands(),
    listProjects(),
    listTasks({ limit: 2000 }),
    listTeam(),
    safeRows<OpsCompletionRecordRow>('ops_completion_records', { limit: 100, order: 'submitted_at' }),
    safeRows<OcgApprovalRow>('ocg_approvals', { limit: 100, order: 'created_at' }),
    safeRows<OcgBlockerRow>('ocg_blockers', { limit: 100, order: 'created_at' }),
    safeRows<OcgDecisionRow>('ocg_decisions', { limit: 100, order: 'created_at' }),
    safeRows<OcgRecurringTaskRow>('ocg_recurring_tasks', { limit: 100, order: 'next_run_at', ascending: true }),
    safeRows<MarketingContentRow>('marketing_content', { limit: 500, order: 'created_at' }),
    safeRows<MarketingCampaignRow>('marketing_campaigns', { limit: 100, order: 'created_at' }),
    safeRows<NptServiceJobRow>('npt_service_jobs', { limit: 300, order: 'created_at' }),
    safeRows<NptReminderRow>('npt_reminders', { limit: 100, order: 'due_at', ascending: true }),
    safeRows<RayyanStudentRow>('rayyan_students', { limit: 500, order: 'created_at' }),
    safeRows<RayyanAdmissionRow>('rayyan_admissions', { limit: 200, order: 'created_at' }),
    safeRows<RayyanFeeFollowupRow>('rayyan_fee_followups', { limit: 200, order: 'next_follow_up_date', ascending: true }),
    safeRows<RayyanAdminTaskRow>('rayyan_admin_tasks', { limit: 200, order: 'due_date', ascending: true }),
    safeRows<RayyanSchoolpayPaymentSnapshotRow>('rayyan_schoolpay_payment_snapshots', { limit: 500, order: 'captured_at' }),
  ])

  return {
    today,
    brands,
    projects,
    tasks,
    team,
    completions,
    approvals,
    blockers,
    decisions,
    recurring,
    marketingContent,
    marketingCampaigns,
    nptJobs,
    nptReminders,
    rayyanStudents,
    rayyanAdmissions,
    rayyanFeeFollowups,
    rayyanAdminTasks,
    rayyanSchoolpaySnapshots,
  }
}

export function dueWithinDays(date: string | null | undefined, days: number, today = todayInEat()): boolean {
  if (!date) return false
  const now = new Date(`${today}T00:00:00.000Z`).getTime()
  const due = new Date(`${date.slice(0, 10)}T00:00:00.000Z`).getTime()
  const diffDays = Math.floor((due - now) / 86_400_000)
  return diffDays >= 0 && diffDays <= days
}

export function isOverdue(date: string | null | undefined, today = todayInEat()): boolean {
  return Boolean(date && date.slice(0, 10) < today)
}

export function activeTasks(tasks: OpsTaskRow[]): OpsTaskRow[] {
  return tasks.filter((t) => t.active === 'Yes' && isActiveStatus(t.current_status))
}

export function workloadLabel(active: number, overdue: number): 'Light' | 'Normal' | 'Heavy' | 'Overloaded' {
  if (overdue >= 3 || active >= 12) return 'Overloaded'
  if (overdue >= 1 || active >= 8) return 'Heavy'
  if (active >= 3) return 'Normal'
  return 'Light'
}

import { db } from './serverClient'
import type { OpsTeamMemberRow } from '@ocg/db'

export interface AttendanceRow {
  id: string
  team_member_id: string | null
  employee_code: string
  employee_name: string
  employee_email: string
  attendance_date: string
  check_in_at: string | null
  check_out_at: string | null
  source: string
  device_name: string
  raw_payload: Record<string, unknown>
  imported_by: string
  notes: string
  created_at: string
  updated_at: string
}

export async function listAttendanceFor(actor: {
  email: string | null
  name: string
  can: (section: 'management', level?: 'view' | 'edit') => boolean
  permissions: unknown
}): Promise<AttendanceRow[]> {
  let q = db()
    .from('ops_attendance_records')
    .select('*')
    .order('attendance_date', { ascending: false })
    .limit(500)
  if (actor.permissions !== null && !actor.can('management', 'view')) {
    // Scope to this person only. Identity is by email; there is deliberately NO
    // name fallback — two employees sharing a name would otherwise see each
    // other's attendance. Without an email we return nothing rather than guess.
    if (actor.email) q = q.eq('employee_email', actor.email.toLowerCase())
    else return []
  }
  const { data } = await q
  return (data as AttendanceRow[] | null) ?? []
}

export async function upsertAttendance(input: {
  teamMember?: OpsTeamMemberRow | null
  employee_code?: string
  employee_name: string
  employee_email?: string
  attendance_date: string
  check_in_at?: string | null
  check_out_at?: string | null
  source?: string
  device_name?: string
  imported_by?: string
  raw_payload?: Record<string, unknown>
  notes?: string
}): Promise<AttendanceRow> {
  const { data, error } = await db()
    .from('ops_attendance_records')
    .upsert({
      team_member_id: input.teamMember?.id ?? null,
      employee_code: input.employee_code ?? '',
      employee_name: input.employee_name,
      employee_email: input.employee_email?.trim().toLowerCase() ?? input.teamMember?.email?.toLowerCase() ?? '',
      attendance_date: input.attendance_date,
      check_in_at: input.check_in_at ?? null,
      check_out_at: input.check_out_at ?? null,
      source: input.source ?? 'manual_export',
      device_name: input.device_name ?? 'Deli S151',
      imported_by: input.imported_by ?? '',
      raw_payload: input.raw_payload ?? {},
      notes: input.notes ?? '',
      updated_at: new Date().toISOString(),
    }, {
      // Migration 058 added the (member, code, date) unique index. Without an
      // explicit conflict target this upsert INSERTED duplicates on a
      // re-imported week instead of updating the existing day.
      onConflict: 'team_member_id,employee_code,attendance_date',
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as AttendanceRow
}

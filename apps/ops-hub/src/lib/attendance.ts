import { db } from './serverClient'
import type { OpsAttendanceEventRow, OpsTeamMemberRow } from '@ocg/db'
import { todayInEat } from './serverClient'

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

export interface AttendanceEvidenceDaily {
  team_member_id: string
  employee_name: string
  employee_email: string
  event_date: string
  source: OpsAttendanceEventRow['source']
  check_in_at: string | null
  check_out_at: string | null
  in_evidence_count: number
  out_evidence_count: number
  evidence_event_ids: string[]
  latest_recorded_at: string
}

export async function listAttendanceEvidence(actor: {
  teamMemberId: string | null
  can: (section: 'management', level?: 'view' | 'edit') => boolean
  permissions: unknown
}, opts: { from?: string; to?: string; limit?: number } = {}): Promise<AttendanceEvidenceDaily[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (db() as any).from('ops_attendance_evidence_daily').select('*')
    .order('event_date', { ascending: false }).order('employee_name').limit(opts.limit ?? 1500)
  if (opts.from) query = query.gte('event_date', opts.from)
  if (opts.to) query = query.lte('event_date', opts.to)
  if (actor.permissions !== null && !actor.can('management', 'view')) {
    if (!actor.teamMemberId) return []
    query = query.eq('team_member_id', actor.teamMemberId)
  }
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return ((data as AttendanceEvidenceDaily[] | null) ?? []).map((row) => ({
    ...row,
    in_evidence_count: Number(row.in_evidence_count ?? 0),
    out_evidence_count: Number(row.out_evidence_count ?? 0),
  }))
}

export async function attendanceEventsForMember(teamMemberId: string, eventDate = todayInEat()): Promise<OpsAttendanceEventRow[]> {
  const { data, error } = await db().from('ops_attendance_events').select('*')
    .eq('team_member_id', teamMemberId).eq('event_date', eventDate).order('occurred_at')
  if (error) throw new Error(error.message)
  return (data as OpsAttendanceEventRow[] | null) ?? []
}

export async function recordAttendanceEvent(input: {
  team_member_id: string
  occurred_at: string
  direction: 'in' | 'out'
  source: OpsAttendanceEventRow['source']
  device_name?: string
  device_event_id?: string
  recorded_by?: string
  recorded_by_user_id?: string | null
  reason?: string
  notes?: string
  source_event_key?: string
  raw_payload?: Record<string, unknown>
}): Promise<OpsAttendanceEventRow> {
  if (!input.team_member_id) throw new Error('An employee is required.')
  const occurred = new Date(input.occurred_at)
  if (Number.isNaN(occurred.getTime())) throw new Error('Attendance time is invalid.')
  const eventDate = occurred.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' })
  if (input.source === 'reviewer_manual' && (!input.recorded_by?.trim() || !input.reason?.trim())) {
    throw new Error('Manual attendance needs the reviewer identity and a reason.')
  }
  if (input.source_event_key) {
    const { data: existing } = await db().from('ops_attendance_events').select('*')
      .eq('source_event_key', input.source_event_key).maybeSingle()
    if (existing) return existing as OpsAttendanceEventRow
  }
  const { data, error } = await db().from('ops_attendance_events').insert({
    team_member_id: input.team_member_id,
    occurred_at: occurred.toISOString(),
    event_date: eventDate,
    direction: input.direction,
    source: input.source,
    device_name: input.device_name ?? '',
    device_event_id: input.device_event_id ?? '',
    recorded_by: input.recorded_by ?? '',
    recorded_by_user_id: input.recorded_by_user_id ?? null,
    reason: input.reason ?? '',
    notes: input.notes ?? '',
    source_event_key: input.source_event_key ?? '',
    raw_payload: input.raw_payload ?? {},
  }).select('*').single()
  if (error) throw new Error(error.message)
  return data as OpsAttendanceEventRow
}

export async function selfClock(input: {
  teamMemberId: string
  direction: 'in' | 'out'
  recordedByUserId: string
}): Promise<OpsAttendanceEventRow> {
  const now = new Date()
  const today = now.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' })
  const events = await attendanceEventsForMember(input.teamMemberId, today)
  const self = events.filter((event) => event.source === 'employee_self')
  if (input.direction === 'in' && self.some((event) => event.direction === 'in')) {
    throw new Error('You have already clocked in today.')
  }
  if (input.direction === 'out') {
    if (!self.some((event) => event.direction === 'in')) throw new Error('Clock in before clocking out.')
    if (self.some((event) => event.direction === 'out')) throw new Error('You have already clocked out today.')
  }
  return recordAttendanceEvent({
    team_member_id: input.teamMemberId,
    occurred_at: now.toISOString(),
    direction: input.direction,
    source: 'employee_self',
    recorded_by: 'Employee self-service',
    recorded_by_user_id: input.recordedByUserId,
    source_event_key: `employee-self:${input.teamMemberId}:${today}:${input.direction}`,
  })
}

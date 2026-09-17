import { db } from './serverClient'
import type { OpsAttendanceEventRow, OpsTeamMemberRow } from '@ocg/db'
import { todayInEat } from './serverClient'
import {
  calculateAttendance,
  effectiveSchedule,
  effectiveOpenCheckoutAt,
  interpretDayEvidence,
  interpretStoredAttendance,
  isDeviceSource,
  storedPunchAt,
  verifiedOvertimeMinutes,
  type ScheduleOverride,
  type WorkSchedule,
} from './attendanceModel'

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
  schedule_id: string | null
  biometric_id: string
  scheduled_start_at: string | null
  scheduled_end_at: string | null
  break_minutes: number
  expected_minutes: number
  actual_minutes: number
  late_minutes: number
  early_departure_minutes: number
  overtime_minutes: number
  status: string
  punch_count: number
  all_punches: AttendancePunch[]
  evidence_summary_generated_at: string | null
  created_at: string
  updated_at: string
}

export interface AttendancePunch {
  id: string
  at: string
  /** 'punch' = an intermediate device punch that is neither arrival nor close-out. */
  direction: 'in' | 'out' | 'punch'
  source: OpsAttendanceEventRow['source']
  label: string
}

export interface AttendanceConsoleRecord extends AttendanceRow {
  check_in_source: OpsAttendanceEventRow['source'] | null
  check_out_source: OpsAttendanceEventRow['source'] | null
  check_in_label: string
  check_out_label: string
  is_auto_closed: boolean
  is_checkout_missing: boolean
  /** A close-out with no arrival — hours wait for a manually entered arrival. */
  is_checkin_missing: boolean
  /** The day's only device punch was read as the close-out (17:00 or later). */
  lone_punch_closeout: boolean
  /** The row exactly as stored, when the reading above differs from it. */
  stored_check_in_at: string | null
  stored_check_out_at: string | null
  is_hours_capped: boolean
  effective_check_out_at: string | null
  effective_actual_minutes: number
  auto_close_processed_at: string | null
  time_variance_minutes: number
  open_now: boolean
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
  return data as unknown as AttendanceRow
}

export async function listAttendanceRecords(actor: {
  email: string | null
  teamMemberId: string | null
  can: (section: 'management', level?: 'view' | 'edit') => boolean
  permissions: unknown
}, opts: { from?: string; to?: string; employeeId?: string; limit?: number } = {}): Promise<AttendanceConsoleRecord[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (db() as any)
    .from('ops_attendance_records')
    .select('*')
    .order('attendance_date', { ascending: false })
    .order('employee_name', { ascending: true })
    .limit(opts.limit ?? 900)

  if (opts.from) query = query.gte('attendance_date', opts.from)
  if (opts.to) query = query.lte('attendance_date', opts.to)
  if (opts.employeeId) query = query.eq('team_member_id', opts.employeeId)

  if (actor.permissions !== null && !actor.can('management', 'view')) {
    if (actor.teamMemberId) query = query.eq('team_member_id', actor.teamMemberId)
    else if (actor.email) query = query.eq('employee_email', actor.email.toLowerCase())
    else return []
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return ((data as AttendanceRow[] | null) ?? []).map(toConsoleRecord)
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
  const event = data as OpsAttendanceEventRow
  await syncAttendanceRecordFromEvents(event.team_member_id, event.event_date)
  return event
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
    return self.find((event) => event.direction === 'in')!
  }
  if (input.direction === 'out') {
    if (!events.some((event) => event.direction === 'in')) throw new Error('Clock in before clocking out.')
    if (self.some((event) => event.direction === 'out')) return self.find((event) => event.direction === 'out')!
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

export async function autoCloseOpenAttendanceRecords(attendanceDate = todayInEat()) {
  const processedAt = new Date().toISOString()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from('ops_attendance_records')
    .select('*')
    .eq('attendance_date', attendanceDate)
    .not('check_in_at', 'is', null)
    .is('check_out_at', null)
  if (error) throw new Error(error.message)

  const closed: OpsAttendanceEventRow[] = []
  for (const record of ((data as AttendanceRow[] | null) ?? [])) {
    if (!record.team_member_id) continue
    if (!record.scheduled_end_at) continue
    closed.push(await recordAttendanceEvent({
      team_member_id: record.team_member_id,
      occurred_at: record.scheduled_end_at,
      direction: 'out',
      source: 'system_auto',
      recorded_by: 'System auto checkout',
      reason: 'No checkout recorded before nightly closeout',
      notes: 'Auto-closed',
      source_event_key: `system-auto:${record.team_member_id}:${attendanceDate}:out`,
      raw_payload: {
        attendance_record_id: record.id,
        attendance_date: attendanceDate,
        processed_at: processedAt,
        effective_checkout_at: record.scheduled_end_at,
      },
    }))
  }
  return { attendanceDate, closed }
}

async function syncAttendanceRecordFromEvents(teamMemberId: string, eventDate: string): Promise<AttendanceRow | null> {
  const [events, teamMember, employeeCode, schedule] = await Promise.all([
    attendanceEventsForMember(teamMemberId, eventDate),
    loadTeamMember(teamMemberId),
    primaryAttendanceCode(teamMemberId),
    loadEffectiveSchedule(teamMemberId, eventDate),
  ])
  if (!teamMember || events.length === 0) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = (db() as any).from('ops_attendance_records')
  const { data: existing, error: findError } = await table
    .select('id, raw_payload, all_punches')
    .eq('team_member_id', teamMember.id)
    .eq('attendance_date', eventDate)
    .maybeSingle()
  if (findError) throw new Error(findError.message)

  const payload = deriveAttendanceRecord({ events, teamMember, employeeCode, schedule, eventDate, existing })
  const result = existing?.id
    ? await table.update(payload).eq('id', existing.id).select('*').single()
    : await table.insert(payload).select('*').single()
  if (result.error) throw new Error(result.error.message)
  return result.data as AttendanceRow
}

/**
 * The day's attendance record, derived from every piece of evidence for it.
 * Pure apart from the generated-at stamps, so a correction can be previewed
 * against real data before anything is written.
 */
export function deriveAttendanceRecord(input: {
  events: OpsAttendanceEventRow[]
  teamMember: OpsTeamMemberRow
  employeeCode: string
  schedule: WorkSchedule | null
  eventDate: string
  existing: { raw_payload?: unknown; all_punches?: unknown } | null
}) {
  const { events, teamMember, employeeCode, schedule, eventDate, existing } = input
  // The schedule's start decides whether a lone evening punch could be an
  // evening shift's arrival, so it is resolved before the punches are read.
  const plannedStart = calculateAttendance({ dateISO: eventDate, schedule, checkIn: null, checkOut: null }).scheduledStartAt
  const reading = interpretDayEvidence(events, { scheduledStartAt: plannedStart })
  const eventAt = (at: string | null) =>
    at ? events.find((event) => Date.parse(event.occurred_at) === Date.parse(at)) ?? null : null
  const inEvent = eventAt(reading.checkIn)
  const outEvent = eventAt(reading.checkOut)
  const checkIn = reading.checkIn
  const checkOut = reading.checkOut
  const calc = calculateAttendance({ dateISO: eventDate, schedule, checkIn, checkOut })
  const overtime = verifiedOvertimeMinutes(calc.overtimeMinutes, reading.checkOutSource)
  const source = events.some((event) => event.source === 'biometric')
    ? 'biometric'
    : events.some((event) => event.source === 'reviewer_manual')
      ? 'manual'
      : 'api'

  const eventPunches = events.map((event) => ({
    id: event.id,
    at: event.occurred_at,
    direction: event.direction,
    source: event.source,
    label: sourceLabel(event.source),
  }))
  // A historical day keeps its original device punches (including intermediate
  // ones that never became events); new evidence is added alongside them.
  const priorPunches = (Array.isArray(existing?.all_punches) ? existing!.all_punches as unknown[] : [])
    .filter((punch) => {
      const at = storedPunchAt(punch)
      const id = (punch as { id?: unknown }).id
      if (!at || (typeof id === 'string' && eventPunches.some((event) => event.id === id))) return false
      return !events.some((event) => isDeviceSource(event.source) && Date.parse(event.occurred_at) === Date.parse(at))
    })

  return {
    team_member_id: teamMember.id,
    employee_code: employeeCode,
    employee_name: teamMember.name,
    employee_email: teamMember.email?.trim().toLowerCase() ?? '',
    attendance_date: eventDate,
    check_in_at: checkIn,
    check_out_at: checkOut,
    source,
    device_name: inEvent?.device_name || outEvent?.device_name || '',
    raw_payload: {
      // Provenance from an earlier writer (a historical import id, its source
      // file and interpretation) is kept; this derivation's fields are layered on.
      ...((existing?.raw_payload as Record<string, unknown> | null) ?? {}),
      check_in_source: reading.checkInSource,
      check_out_source: reading.checkOutSource,
      lone_punch_closeout: reading.lonePunchCloseout,
      check_in_missing: reading.checkInMissing,
      system_auto_closed: reading.checkOutSource === 'system_auto',
      system_auto_processed_at: outEvent?.source === 'system_auto'
        ? (outEvent.raw_payload?.processed_at ?? outEvent.created_at)
        : null,
      effective_checkout_at: outEvent?.source === 'system_auto' ? outEvent.occurred_at : null,
      evidence_event_ids: events.map((event) => event.id),
      derivation_rule: 'device punches: first IN, last OUT; a lone device punch from 17:00 is the close-out',
    },
    imported_by: '',
    notes: reading.checkOutSource === 'system_auto'
      ? 'Auto-closed'
      : reading.lonePunchCloseout
        ? 'Single evening punch read as the close-out; arrival time needed.'
        : '',
    schedule_id: schedule?.id ?? null,
    biometric_id: employeeCode,
    scheduled_start_at: calc.scheduledStartAt,
    scheduled_end_at: calc.scheduledEndAt,
    break_minutes: calc.breakMinutes,
    expected_minutes: calc.expectedMinutes,
    actual_minutes: calc.actualMinutes,
    late_minutes: calc.lateMinutes,
    early_departure_minutes: calc.earlyDepartureMinutes,
    overtime_minutes: overtime,
    status: calc.status,
    punch_count: priorPunches.length + eventPunches.length,
    all_punches: [...priorPunches, ...eventPunches],
    evidence_summary_generated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

async function loadTeamMember(teamMemberId: string): Promise<OpsTeamMemberRow | null> {
  const { data, error } = await db().from('ops_team_members').select('*').eq('id', teamMemberId).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as OpsTeamMemberRow | null) ?? null
}

async function primaryAttendanceCode(teamMemberId: string): Promise<string> {
  const { data } = await db()
    .from('ops_attendance_identities')
    .select('employee_code')
    .eq('team_member_id', teamMemberId)
    .eq('active', true)
    .limit(1)
    .maybeSingle()
  return String((data as { employee_code?: string } | null)?.employee_code ?? '')
}

async function loadEffectiveSchedule(teamMemberId: string, dateISO: string): Promise<WorkSchedule | null> {
  const looseDb = db() as unknown as LooseDb
  const [{ data: schedules, error: scheduleError }, { data: overrides, error: overrideError }] = await Promise.all([
    looseDb.from('ops_work_schedules').select('*').eq('team_member_id', teamMemberId).eq('active', true),
    looseDb.from('ops_schedule_overrides').select('*').eq('team_member_id', teamMemberId),
  ])
  if (scheduleError) throw new Error(scheduleError.message)
  if (overrideError) throw new Error(overrideError.message)
  return effectiveSchedule(
    ((schedules as Array<Record<string, unknown>> | null) ?? []).map(scheduleFromRow),
    ((overrides as Array<Record<string, unknown>> | null) ?? []).map(overrideFromRow),
    dateISO,
  )
}

type LooseRows = {
  data: Array<Record<string, unknown>> | null
  error: { message: string } | null
}
type LooseEqQuery = PromiseLike<LooseRows> & {
  eq(column: string, value: unknown): LooseEqQuery
}
type LooseDb = {
  from(table: string): {
    select(columns: string): LooseEqQuery
  }
}

function scheduleFromRow(row: Record<string, unknown>): WorkSchedule {
  return {
    id: String(row.id ?? ''),
    workdays: Array.isArray(row.workdays) ? row.workdays.map(Number) : [1, 2, 3, 4, 5],
    start_time: String(row.start_time ?? '08:00'),
    end_time: String(row.end_time ?? '17:00'),
    break_minutes: Number(row.break_minutes ?? 0),
    expected_hours: Number(row.expected_hours ?? 0),
    grace_minutes: Number(row.grace_minutes ?? 0),
    timezone: String(row.timezone ?? 'Africa/Nairobi'),
    effective_from: String(row.effective_from ?? ''),
    effective_to: row.effective_to ? String(row.effective_to) : null,
    active: row.active !== false,
  }
}

function overrideFromRow(row: Record<string, unknown>): ScheduleOverride {
  return {
    start_date: String(row.start_date ?? ''),
    end_date: String(row.end_date ?? ''),
    start_time: row.start_time ? String(row.start_time) : null,
    end_time: row.end_time ? String(row.end_time) : null,
    break_minutes: row.break_minutes == null ? null : Number(row.break_minutes),
    expected_hours: row.expected_hours == null ? null : Number(row.expected_hours),
    workdays: Array.isArray(row.workdays) ? row.workdays.map(Number) : null,
  }
}

function toConsoleRecord(row: AttendanceRow): AttendanceConsoleRecord {
  const raw = (row.raw_payload ?? {}) as Record<string, unknown>
  // Historical rows are never rewritten; a lone evening punch is only READ as
  // the close-out here, so the console stops presenting it as an arrival.
  const reading = interpretStoredAttendance(row)
  const checkIn = reading.checkIn
  const checkOut = reading.checkOut
  const punches = normalisePunches(row, checkIn, checkOut)
  const fallbackSource: OpsAttendanceEventRow['source'] = raw.import_id ? 'historical_import' : 'biometric'
  const checkInSource = checkIn
    ? (raw.check_in_source && !reading.lonePunchCloseout ? String(raw.check_in_source) as OpsAttendanceEventRow['source'] : sourceOfPunch(punches, checkIn) ?? fallbackSource)
    : null
  const checkOutSource = checkOut
    ? (raw.check_out_source ? String(raw.check_out_source) as OpsAttendanceEventRow['source'] : sourceOfPunch(punches, checkOut) ?? fallbackSource)
    : null
  const isAutoClosed = checkOutSource === 'system_auto' || raw.system_auto_closed === true || row.notes.includes('Auto-closed')
  const nowIso = new Date().toISOString()
  const missingCheckout = !!checkIn && !checkOut
  const effectiveCheckOut = checkOut ?? (missingCheckout
    ? effectiveOpenCheckoutAt({ nowIso, scheduledEndAt: row.scheduled_end_at })
    : null)
  // No arrival means no hours — never an estimate from the close-out alone.
  const effectiveActual = checkIn && effectiveCheckOut
    ? Math.max(0, Math.round((Date.parse(effectiveCheckOut) - Date.parse(checkIn)) / 60_000) - Number(row.break_minutes ?? 0))
    : checkIn ? Number(row.actual_minutes ?? 0) : 0
  const capped = missingCheckout && !!row.scheduled_end_at && Date.parse(nowIso) >= Date.parse(row.scheduled_end_at)
  return {
    ...row,
    check_in_at: checkIn,
    check_out_at: checkOut,
    stored_check_in_at: row.check_in_at,
    stored_check_out_at: row.check_out_at,
    all_punches: punches,
    check_in_source: checkInSource,
    check_out_source: checkOutSource,
    check_in_label: checkInSource ? sourceLabel(checkInSource) : '',
    check_out_label: isAutoClosed ? `${formatEatTime(checkOut)} · Auto-closed` : checkOutSource ? sourceLabel(checkOutSource) : '',
    is_auto_closed: isAutoClosed,
    is_checkout_missing: missingCheckout,
    is_checkin_missing: !checkIn && !!checkOut,
    lone_punch_closeout: reading.lonePunchCloseout,
    is_hours_capped: capped,
    effective_check_out_at: effectiveCheckOut,
    effective_actual_minutes: effectiveActual,
    auto_close_processed_at: raw.system_auto_processed_at ? String(raw.system_auto_processed_at) : null,
    time_variance_minutes: effectiveActual - Number(row.expected_minutes ?? 0),
    open_now: missingCheckout && (!row.scheduled_end_at || Date.parse(nowIso) < Date.parse(row.scheduled_end_at)),
  }
}

/**
 * One punch shape for the console, whichever writer stored the day.
 *
 * Event-derived rows store `{ id, at, direction, source }`; the historical Deli
 * import stored `{ mode, occurred_at, source_row_number }` with no direction at
 * all. Rendering the second shape as the first is what broke a person's record
 * detail, so direction is resolved here against the day's reading.
 */
function normalisePunches(row: AttendanceRow, checkIn: string | null, checkOut: string | null): AttendancePunch[] {
  const raw = (row.raw_payload ?? {}) as Record<string, unknown>
  const stored = Array.isArray(row.all_punches) ? (row.all_punches as unknown[]) : []
  const sameInstant = (a: string | null, b: string) => !!a && Date.parse(a) === Date.parse(b)
  return stored
    .map((punch, index) => {
      const at = storedPunchAt(punch)
      if (!at) return null
      const p = punch as Record<string, unknown>
      const source = (typeof p['source'] === 'string' ? p['source'] : raw.import_id ? 'historical_import' : 'biometric') as OpsAttendanceEventRow['source']
      const recorded = p['direction'] === 'in' || p['direction'] === 'out' ? p['direction'] : null
      // A deliberate direction stands; a device punch takes its place in the day.
      const direction: AttendancePunch['direction'] = recorded && !isDeviceSource(source)
        ? recorded
        : sameInstant(checkIn, at) ? 'in' : sameInstant(checkOut, at) ? 'out' : 'punch'
      const mode = typeof p['mode'] === 'string' && p['mode'] ? ` · ${p['mode']}` : ''
      return {
        id: typeof p['id'] === 'string' ? p['id'] : `${row.id}:${index}`,
        at,
        direction,
        source,
        label: `${sourceLabel(source)}${mode}`,
      }
    })
    .filter((punch): punch is AttendancePunch => punch !== null)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
}

function sourceOfPunch(punches: AttendancePunch[], at: string): OpsAttendanceEventRow['source'] | null {
  return punches.find((punch) => Date.parse(punch.at) === Date.parse(at))?.source ?? null
}

function sourceLabel(source: OpsAttendanceEventRow['source']): string {
  if (source === 'biometric') return 'Biometric'
  if (source === 'employee_self') return 'Self clock'
  if (source === 'reviewer_manual') return 'Manual / reviewer'
  if (source === 'system_auto') return 'System auto'
  return 'Historical import'
}

function formatEatTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleTimeString('en-KE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Nairobi',
  }) : ''
}

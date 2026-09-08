import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { attendanceEventsForMember, listAttendanceEvidence, recordAttendanceEvent, selfClock } from '@/lib/attendance'
import { listTeam } from '@/lib/team'
import { db } from '@/lib/serverClient'
import { auditEvent } from '@/lib/audit'

export async function GET(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  try {
    const url = new URL(req.url)
    const evidence = await listAttendanceEvidence(actor, { from: url.searchParams.get('from') ?? undefined, to: url.searchParams.get('to') ?? undefined })
    const today = actor.teamMemberId ? await attendanceEventsForMember(actor.teamMemberId) : []
    return NextResponse.json({ ok: true, evidence, today })
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 })
  }
}

export async function POST(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const action = String(body?.action ?? (Array.isArray(body?.rows) ? 'import-biometric' : ''))
    const who = actor.name || actor.email || actor.userId

    if (action === 'self-clock') {
      if (!actor.teamMemberId) return NextResponse.json({ ok: false, error: 'Your account is not linked to an employee profile.' }, { status: 403 })
      const direction = body?.direction === 'out' ? 'out' : 'in'
      const event = await selfClock({ teamMemberId: actor.teamMemberId, direction, recordedByUserId: actor.userId })
      await auditEvent({ actor, action: `attendance.self.${direction}`, entity_table: 'ops_attendance_events', entity_id: event.id, after_data: event as unknown as Record<string, unknown> })
      return NextResponse.json({ ok: true, event }, { status: 201 })
    }

    const canManage = actor.can('management', 'edit') || actor.isSuperAdmin
    if (!canManage) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })

    if (action === 'manual-evidence') {
      const memberId = String(body?.team_member_id ?? '')
      const team = await listTeam()
      if (!team.some((member) => member.id === memberId)) throw new Error('Employee not found.')
      const event = await recordAttendanceEvent({
        team_member_id: memberId,
        occurred_at: String(body?.occurred_at ?? ''),
        direction: body?.direction === 'out' ? 'out' : 'in',
        source: 'reviewer_manual',
        recorded_by: who,
        recorded_by_user_id: actor.userId,
        reason: String(body?.reason ?? ''),
        notes: String(body?.notes ?? ''),
        source_event_key: String(body?.idempotency_key ?? ''),
      })
      await auditEvent({ actor, action: 'attendance.manual.create', entity_table: 'ops_attendance_events', entity_id: event.id, after_data: event as unknown as Record<string, unknown> })
      return NextResponse.json({ ok: true, event }, { status: 201 })
    }

    if (action === 'map-device-identity') {
      const memberId = String(body?.team_member_id ?? '')
      const employeeCode = String(body?.employee_code ?? '').trim()
      if (!memberId || !employeeCode) throw new Error('Employee and device employee code are required.')
      const team = await listTeam()
      if (!team.some((member) => member.id === memberId)) throw new Error('Employee not found.')
      const { data, error } = await db().from('ops_attendance_identities').upsert({
        team_member_id: memberId, device_name: String(body?.device_name ?? ''), employee_code: employeeCode,
        active: true, notes: String(body?.notes ?? ''), created_by: who, updated_at: new Date().toISOString(),
      }, { onConflict: 'device_name,employee_code' }).select('*').single()
      if (error) throw new Error(error.message)
      await auditEvent({
        actor,
        action: 'attendance.identity.upsert',
        entity_table: 'ops_attendance_identities',
        entity_id: String(data.id),
        after_data: data as unknown as Record<string, unknown>,
      })
      return NextResponse.json({ ok: true, identity: data })
    }

    if (action === 'import-biometric') {
      const rows = Array.isArray(body?.rows) ? body.rows : []
      const team = await listTeam()
      const { data: identities } = await db().from('ops_attendance_identities').select('*').eq('active', true)
      const identityMap = new Map(((identities as Array<{ team_member_id: string; device_name: string; employee_code: string }> | null) ?? [])
        .map((identity) => [`${identity.device_name.toLowerCase()}:${identity.employee_code.toLowerCase()}`, identity.team_member_id]))
      const saved = []
      for (const row of rows) {
        const email = String(row.employee_email ?? '').trim().toLowerCase()
        const code = String(row.employee_code ?? row.pin ?? '').trim()
        const device = String(row.device_name ?? 'Deli S151').trim()
        const explicitId = String(row.team_member_id ?? '')
        const teamMember = team.find((member) => member.id === explicitId || (email && member.email?.toLowerCase() === email))
        const mappedId = teamMember?.id ?? identityMap.get(`${device.toLowerCase()}:${code.toLowerCase()}`)
        if (!mappedId) throw new Error(`No employee mapping for biometric code ${code || '(blank)'} on ${device}. Map the device identity first.`)
        for (const [direction, value] of [['in', row.check_in_at], ['out', row.check_out_at]] as const) {
          if (!value) continue
          const occurredAt = String(value)
          saved.push(await recordAttendanceEvent({
            team_member_id: mappedId, occurred_at: occurredAt, direction, source: 'biometric',
            device_name: device, device_event_id: String(row.device_event_id ?? ''), recorded_by: who,
            recorded_by_user_id: actor.userId,
            source_event_key: `biometric:${device}:${code}:${direction}:${new Date(occurredAt).toISOString()}`,
            raw_payload: row,
          }))
        }
      }
      await auditEvent({ actor, action: 'attendance.biometric.import', entity_table: 'ops_attendance_events', entity_id: 'batch', after_data: { event_count: saved.length } })
      return NextResponse.json({ ok: true, saved }, { status: 201 })
    }

    return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 })
  }
}

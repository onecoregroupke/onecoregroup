import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { listAttendanceFor, upsertAttendance } from '@/lib/attendance'
import { listTeam } from '@/lib/team'

export async function GET(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const attendance = await listAttendanceFor(actor)
  return NextResponse.json({ ok: true, attendance })
}

export async function POST(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  if (!actor.can('management', 'edit') && !actor.isSuperAdmin) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const team = await listTeam()
    const rows = Array.isArray(body?.rows) ? body.rows : [body]
    const saved = []
    for (const row of rows) {
      const email = String(row.employee_email ?? '').trim().toLowerCase()
      const name = String(row.employee_name ?? '').trim()
      const teamMember = team.find((m) =>
        (email && m.email?.toLowerCase() === email) ||
        (name && m.name.toLowerCase() === name.toLowerCase()),
      )
      saved.push(await upsertAttendance({
        teamMember,
        employee_code: String(row.employee_code ?? row.pin ?? ''),
        employee_name: name || teamMember?.name || 'Unknown',
        employee_email: email || teamMember?.email || '',
        attendance_date: String(row.attendance_date ?? ''),
        check_in_at: row.check_in_at ? String(row.check_in_at) : null,
        check_out_at: row.check_out_at ? String(row.check_out_at) : null,
        source: String(row.source ?? 'manual_export'),
        device_name: String(row.device_name ?? 'Deli S151'),
        imported_by: actor.email ?? actor.name,
        raw_payload: row,
        notes: String(row.notes ?? ''),
      }))
    }
    return NextResponse.json({ ok: true, saved }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

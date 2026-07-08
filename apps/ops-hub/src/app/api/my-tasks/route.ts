import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { listTasksForAssignee } from '@/lib/tasks'
import { listTeam } from '@/lib/team'
import { db } from '@/lib/serverClient'
import type { NptAppointmentRow, NptCustomerRow } from '@ocg/db'

export interface MyAppointment {
  id: string
  title: string
  start_at: string | null
  end_at: string | null
  location: string
  status: string
  customer_name: string
  notes: string
}

// Tasks assigned to the signed-in user. We map their email → team member name,
// then match tasks by name (assignment is stored by display name, not email).
// Technicians additionally get their upcoming NPT appointments, so scheduled
// service work shows in the same My Tasks view alongside the reminder loop.
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const team = await listTeam()
  const me = team.find((m) => m.email && user.email && m.email.toLowerCase() === user.email.toLowerCase())
  const name = me?.name ?? user.email?.split('@')[0] ?? ''
  if (!name) return NextResponse.json({ ok: true, name: '', tasks: [], appointments: [] })

  const [tasks, appointments] = await Promise.all([
    listTasksForAssignee(name),
    me?.id ? listUpcomingAppointments(me.id) : Promise.resolve([]),
  ])
  return NextResponse.json({ ok: true, name, tasks, appointments })
}

async function listUpcomingAppointments(technicianId: string): Promise<MyAppointment[]> {
  const supabase = db()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('npt_appointments')
    .select('*')
    .eq('technician_id', technicianId)
    .gte('start_at', since)
    .neq('status', 'Completed')
    .neq('status', 'Cancelled')
    .order('start_at', { ascending: true })
    .limit(30)
  const appointments = (data as NptAppointmentRow[] | null) ?? []
  if (appointments.length === 0) return []

  const customerIds = [...new Set(appointments.map((a) => a.customer_id).filter(Boolean))] as string[]
  const { data: customerRows } = customerIds.length
    ? await supabase.from('npt_customers').select('id, full_name').in('id', customerIds)
    : { data: [] }
  const customerName = new Map(
    ((customerRows as Pick<NptCustomerRow, 'id' | 'full_name'>[] | null) ?? []).map((c) => [c.id, c.full_name]),
  )

  return appointments.map((a) => ({
    id: a.id,
    title: a.title || 'Appointment',
    start_at: a.start_at,
    end_at: a.end_at,
    location: a.location,
    status: a.status,
    customer_name: a.customer_id ? customerName.get(a.customer_id) ?? '' : '',
    notes: a.notes,
  }))
}

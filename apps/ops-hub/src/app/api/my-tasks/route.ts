import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { listTasksForAssignee } from '@/lib/tasks'
import { listTeam } from '@/lib/team'
import { listUpcomingAppointments, type MyAppointment } from '@/lib/myWork'

export type { MyAppointment }

/**
 * Tasks assigned to the signed-in user, plus their upcoming appointments.
 *
 * The UI has moved to My Work (§5), which reads the same records server-side.
 * This route is kept for anything already calling it, and now shares ONE
 * appointment implementation with My Work rather than carrying a second copy
 * that could drift.
 */
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

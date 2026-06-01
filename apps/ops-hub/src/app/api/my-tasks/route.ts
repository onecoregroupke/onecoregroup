import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { listTasksForAssignee } from '@/lib/tasks'
import { listTeam } from '@/lib/team'

// Tasks assigned to the signed-in user. We map their email → team member name,
// then match tasks by name (assignment is stored by display name, not email).
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const team = await listTeam()
  const me = team.find((m) => m.email && user.email && m.email.toLowerCase() === user.email.toLowerCase())
  const name = me?.name ?? user.email?.split('@')[0] ?? ''
  if (!name) return NextResponse.json({ ok: true, name: '', tasks: [] })

  const tasks = await listTasksForAssignee(name)
  return NextResponse.json({ ok: true, name, tasks })
}

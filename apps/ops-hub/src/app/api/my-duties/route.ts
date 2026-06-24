import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { listTeam } from '@/lib/team'
import { listDutiesForAssignee, listDutyLogsForDate } from '@/lib/duties'
import { todayInEat } from '@/lib/serverClient'

// Today's daily duties for the signed-in portal user + their completion status.
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const team = await listTeam()
  const me = team.find((m) => m.email && user.email && m.email.toLowerCase() === user.email.toLowerCase())
  if (!me) return NextResponse.json({ ok: true, name: '', date: todayInEat(), duties: [] })

  const [duties, logs] = await Promise.all([listDutiesForAssignee(me.id), listDutyLogsForDate()])
  const statusByDuty = new Map(logs.map((l) => [l.duty_id, l.status]))
  return NextResponse.json({
    ok: true,
    name: me.name,
    date: todayInEat(),
    duties: duties.map((d) => ({ id: d.id, title: d.title, description: d.description, status: statusByDuty.get(d.id) ?? 'pending' })),
  })
}

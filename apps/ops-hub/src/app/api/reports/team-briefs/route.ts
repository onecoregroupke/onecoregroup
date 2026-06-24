import { NextResponse, type NextRequest } from 'next/server'
import { sendTeamTaskBrief } from '@/lib/email'
import { listTeam } from '@/lib/team'
import { listTasksForAssignee } from '@/lib/tasks'
import { isActiveStatus } from '@/lib/taskStatuses'

export async function GET(req: NextRequest) {
  const secret = process.env['CRON_SECRET']
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const baseUrl = (process.env['NEXT_PUBLIC_OPS_URL'] || process.env['OPS_OPS_BASE_URL'] || 'https://ops.onecoregroup.com').replace(/\/$/, '')
  const team = await listTeam()
  const results = []
  for (const member of team) {
    if (!member.email) continue
    const tasks = (await listTasksForAssignee(member.name))
      .filter((task) => isActiveStatus(task.current_status))
      .slice(0, 25)
    const sent = await sendTeamTaskBrief({
      to: member.email,
      name: member.name,
      tasks: tasks.map((task) => ({
        task_id: task.task_id,
        task_name: task.task_name,
        project_name: task.project_name,
        priority: task.priority,
        target_date: task.target_date,
        current_status: task.current_status,
      })),
      portalUrl: `${baseUrl}/my-tasks`,
    })
    results.push({ member: member.name, email: member.email, open: tasks.length, sent })
  }

  return NextResponse.json({
    ok: true,
    sent: results.filter((item) => item.sent).length,
    skipped: team.length - results.length,
    results,
  })
}

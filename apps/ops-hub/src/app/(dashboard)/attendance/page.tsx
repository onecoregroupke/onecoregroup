import { AttendanceImportForm } from '@/components/attendance/AttendanceImportForm'
import { AttendanceWorkspace } from '@/components/attendance/AttendanceWorkspace'
import {
  attendanceEventsForMember,
  listAttendanceEvidence,
  listAttendanceRecords,
} from '@/lib/attendance'
import { requireActor } from '@/lib/server-auth'
import { listTeam } from '@/lib/team'
import { todayInEat } from '@/lib/serverClient'

export const dynamic = 'force-dynamic'

export default async function AttendancePage() {
  const actor = await requireActor()
  const canManage = actor.can('management', 'edit') || actor.isSuperAdmin
  const todayDate = todayInEat()
  const [records, evidence, today, team] = await Promise.all([
    listAttendanceRecords(actor, { from: todayDate, to: todayDate }),
    listAttendanceEvidence(actor, { from: todayDate, to: todayDate }),
    actor.teamMemberId ? attendanceEventsForMember(actor.teamMemberId) : Promise.resolve([]),
    canManage ? listTeam() : Promise.resolve([]),
  ])
  const people = canManage
    ? team.map((member) => ({ id: member.id, name: member.name }))
    : actor.teamMemberId ? [{ id: actor.teamMemberId, name: actor.name }] : []

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Team operations</p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">Attendance</h1>
        <p className="mt-1 text-sm text-gray-500">
          Today-first attendance, self clock-in/out, schedule comparison and auditable evidence.
        </p>
      </div>

      <AttendanceWorkspace
        records={records}
        evidence={evidence}
        today={today}
        todayDate={todayDate}
        canManage={canManage}
        people={people}
      />

      {canManage && <AttendanceImportForm />}
    </div>
  )
}

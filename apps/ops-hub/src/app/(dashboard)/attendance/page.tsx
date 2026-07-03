import { AttendanceImportForm } from '@/components/attendance/AttendanceImportForm'
import { listAttendanceFor } from '@/lib/attendance'
import { requireActor } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

export default async function AttendancePage() {
  const actor = await requireActor()
  const rows = await listAttendanceFor(actor)
  const canManage = actor.can('management', 'edit') || actor.isSuperAdmin

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Team operations</p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">Attendance</h1>
        <p className="mt-1 text-sm text-gray-500">
          Check-in and check-out history from the fingerprint attendance machine or imported exports.
        </p>
      </div>

      {canManage && <AttendanceImportForm />}

      <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No attendance records yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Team member</th>
                  <th className="px-4 py-3">Check in</th>
                  <th className="px-4 py-3">Check out</th>
                  <th className="px-4 py-3">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">{row.attendance_date}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{row.employee_name}</p>
                      <p className="text-xs text-gray-400">{row.employee_email || row.employee_code}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatEat(row.check_in_at)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatEat(row.check_out_at)}</td>
                    <td className="px-4 py-3 text-gray-500">{row.device_name || row.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function formatEat(value: string | null): string {
  if (!value) return '-'
  return new Date(value).toLocaleTimeString('en-KE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Nairobi',
  })
}

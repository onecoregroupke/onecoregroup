import { getRayyanAdminData } from '@/lib/management'

export const dynamic = 'force-dynamic'

export default async function RayyanClassesPage() {
  const { classes, attendance, team } = await getRayyanAdminData()
  const teacherById = new Map(team.map((m) => [m.id, m.name]))
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-semibold text-gray-900">Classes & attendance notes</h1><p className="text-sm text-gray-500">Light class records and attendance/admin notes for the school layer.</p></div>
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Classes</h2>{classes.length === 0 ? <p className="text-sm text-gray-500">No classes configured yet.</p> : <ul className="divide-y divide-gray-100">{classes.map((c) => <li key={c.id} className="py-3"><p className="text-sm font-medium text-gray-800">{c.name}</p><p className="text-xs text-gray-400">{c.level || 'Level not set'} · {c.teacher_id ? teacherById.get(c.teacher_id) ?? 'Teacher' : 'no teacher assigned'}</p></li>)}</ul>}</section>
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Recent attendance notes</h2>{attendance.length === 0 ? <p className="text-sm text-gray-500">No attendance notes yet.</p> : <ul className="divide-y divide-gray-100">{attendance.slice(0, 12).map((a) => <li key={a.id} className="py-3"><p className="text-sm font-medium text-gray-800">{a.attendance_date} · {a.status}</p><p className="text-xs text-gray-400">{a.notes || 'No notes'}</p></li>)}</ul>}</section>
      </div>
    </div>
  )
}

import { getRhythmsAdminData } from '@/lib/management'
import { RhythmsQuickAdd } from '@/components/rhythms/RhythmsQuickAdd'

export const dynamic = 'force-dynamic'

export default async function RhythmsClassesPage() {
  const { classes, students, team } = await getRhythmsAdminData()
  const teacherById = new Map(team.map((t) => [t.id, t.name]))
  const countByClass = new Map<string, number>()
  for (const s of students) if (s.class_id) countByClass.set(s.class_id, (countByClass.get(s.class_id) ?? 0) + 1)
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Rhythms classes</h1>
        <p className="text-sm text-gray-500">Classes / cohorts, their level, and the assigned teacher.</p>
      </div>
      <RhythmsQuickAdd />
      <section className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
        {classes.length === 0 ? <p className="p-6 text-sm text-gray-500">No classes yet.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
              <th className="px-4 py-3">Class</th><th className="px-4 py-3">Level</th><th className="px-4 py-3">Teacher</th>
              <th className="px-4 py-3">Students</th><th className="px-4 py-3">Active</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">{classes.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{c.name}</td>
                <td className="px-4 py-3 text-gray-500">{c.level || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{c.teacher_id ? teacherById.get(c.teacher_id) ?? '—' : '—'}</td>
                <td className="px-4 py-3 text-gray-500">{countByClass.get(c.id) ?? 0}</td>
                <td className="px-4 py-3 text-gray-500">{c.is_active ? 'Yes' : 'No'}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </div>
  )
}

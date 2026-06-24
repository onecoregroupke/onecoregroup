import { getRhythmsAdminData } from '@/lib/management'
import { RhythmsQuickAdd } from '@/components/rhythms/RhythmsQuickAdd'

export const dynamic = 'force-dynamic'

export default async function RhythmsAdminTasksPage() {
  const { adminTasks, students } = await getRhythmsAdminData()
  const studentById = new Map(students.map((s) => [s.id, s.full_name]))
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Rhythms admin tasks</h1>
        <p className="text-sm text-gray-500">Internal admin follow-ups — documents, parent comms, and operational chores.</p>
      </div>
      <RhythmsQuickAdd />
      <section className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
        {adminTasks.length === 0 ? <p className="p-6 text-sm text-gray-500">No admin tasks yet.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
              <th className="px-4 py-3">Task</th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Priority</th><th className="px-4 py-3">Due</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">{adminTasks.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{t.title}</td>
                <td className="px-4 py-3 text-gray-500">{t.student_id ? studentById.get(t.student_id) ?? '—' : '—'}</td>
                <td className="px-4 py-3 text-gray-500">{t.status}</td>
                <td className="px-4 py-3 text-gray-500">{t.priority}</td>
                <td className="px-4 py-3 text-gray-500">{t.due_date || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </div>
  )
}

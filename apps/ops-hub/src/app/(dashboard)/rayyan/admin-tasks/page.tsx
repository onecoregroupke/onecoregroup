import Link from 'next/link'
import { getRayyanAdminData } from '@/lib/management'

export const dynamic = 'force-dynamic'

export default async function RayyanAdminTasksPage() {
  const { adminTasks, students } = await getRayyanAdminData()
  const studentById = new Map(students.map((s) => [s.id, s.full_name]))
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-semibold text-gray-900">Rayyan admin tasks</h1><p className="text-sm text-gray-500">School admin work can be linked back to Ops tasks for accountability.</p></div>
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        {adminTasks.length === 0 ? <p className="p-6 text-sm text-gray-500">No admin tasks yet.</p> : <table className="w-full text-sm"><thead><tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400"><th className="px-4 py-3">Task</th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Due</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-gray-50">{adminTasks.map((t) => <tr key={t.id} className="hover:bg-gray-50"><td className="px-4 py-3"><p className="font-medium text-gray-800">{t.title}</p>{t.ops_task_id && <Link href={`/tasks/${t.ops_task_id}`} className="text-xs text-ocg-gold hover:underline">{t.ops_task_id}</Link>}</td><td className="px-4 py-3 text-gray-500">{t.student_id ? studentById.get(t.student_id) ?? 'Student' : '—'}</td><td className="px-4 py-3 text-gray-500">{t.due_date || '—'}</td><td className="px-4 py-3 text-gray-500">{t.status}</td></tr>)}</tbody></table>}
      </div>
    </div>
  )
}

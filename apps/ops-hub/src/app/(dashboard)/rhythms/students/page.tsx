import { getRhythmsAdminData } from '@/lib/management'
import { RhythmsQuickAdd } from '@/components/rhythms/RhythmsQuickAdd'

export const dynamic = 'force-dynamic'

export default async function RhythmsStudentsPage() {
  const { students, guardians, classes } = await getRhythmsAdminData()
  const guardianById = new Map(guardians.map((g) => [g.id, g.full_name]))
  const classById = new Map(classes.map((c) => [c.id, c.name]))
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Rhythms students</h1>
        <p className="text-sm text-gray-500">College student records, programme, cohort, class, enrollment state, and SchoolPay references.</p>
      </div>
      <RhythmsQuickAdd />
      <section className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
        {students.length === 0 ? <p className="p-6 text-sm text-gray-500">No Rhythms students yet.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
              <th className="px-4 py-3">Student</th><th className="px-4 py-3">Guardian</th><th className="px-4 py-3">Programme</th>
              <th className="px-4 py-3">Class</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">SchoolPay</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">{students.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{s.full_name}<p className="text-xs font-normal text-gray-400">{s.phone || s.email || ''}</p></td>
                <td className="px-4 py-3 text-gray-500">{s.guardian_id ? guardianById.get(s.guardian_id) ?? s.guardian_name ?? '—' : s.guardian_name || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{s.programme || '—'}{s.cohort ? ` · ${s.cohort}` : ''}</td>
                <td className="px-4 py-3 text-gray-500">{s.class_id ? classById.get(s.class_id) ?? '—' : '—'}</td>
                <td className="px-4 py-3 text-gray-500">{s.enrollment_status}</td>
                <td className="px-4 py-3 text-gray-500">{s.schoolpay_code || s.admission_number || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </div>
  )
}

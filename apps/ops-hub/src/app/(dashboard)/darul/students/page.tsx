import Link from 'next/link'
import { getDarulAdminData } from '@/lib/management'
import { DarulQuickAdd } from '@/components/darul/DarulQuickAdd'

export const dynamic = 'force-dynamic'

export default async function DarulStudentsPage() {
  const { students, guardians, classes } = await getDarulAdminData()
  const guardianById = new Map(guardians.map((g) => [g.id, g.full_name]))
  const classById = new Map(classes.map((c) => [c.id, c.name]))
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Darul Swafa students</h1>
        <p className="text-sm text-gray-500">Student records, halaqa, hifz progress, and enrollment state.</p>
      </div>
      <DarulQuickAdd />
      <section className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
        {students.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No student records yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
                <th className="px-4 py-3">Student</th><th className="px-4 py-3">Guardian</th><th className="px-4 py-3">Halaqa</th>
                <th className="px-4 py-3">Level</th><th className="px-4 py-3">Juz</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Admission</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {students.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800"><Link href={`/darul/students/${s.id}`} className="hover:text-[#2a6a2a] hover:underline">{s.full_name}</Link></td>
                  <td className="px-4 py-3 text-gray-500">{s.guardian_id ? guardianById.get(s.guardian_id) ?? 'Guardian' : '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{s.class_id ? classById.get(s.class_id) ?? '—' : '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{s.halaqa_level || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{s.hifz_juz_completed}/30</td>
                  <td className="px-4 py-3 text-gray-500">{s.enrollment_status}</td>
                  <td className="px-4 py-3 text-gray-500">{s.admission_number || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

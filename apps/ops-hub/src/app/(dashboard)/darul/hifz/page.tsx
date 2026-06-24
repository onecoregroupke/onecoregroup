import { getDarulAdminData } from '@/lib/management'
import { DarulQuickAdd } from '@/components/darul/DarulQuickAdd'

export const dynamic = 'force-dynamic'

const STATUS_TONE: Record<string, string> = {
  memorized: 'bg-emerald-50 text-emerald-700',
  revising: 'bg-amber-50 text-amber-700',
  in_progress: 'bg-blue-50 text-blue-700',
}

export default async function DarulHifzPage() {
  const { hifz, students, team } = await getDarulAdminData()
  const studentById = new Map(students.map((s) => [s.id, s.full_name]))
  const assessorById = new Map(team.map((t) => [t.id, t.name]))
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Hifz progress</h1>
        <p className="text-sm text-gray-500">Qur&apos;an memorization milestones per student — juz, surah, and assessment status.</p>
      </div>
      <DarulQuickAdd />
      <section className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
        {hifz.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No hifz milestones logged yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
                <th className="px-4 py-3">Student</th><th className="px-4 py-3">Juz</th><th className="px-4 py-3">Surah</th>
                <th className="px-4 py-3">Ayah</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Assessed</th><th className="px-4 py-3">Assessor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {hifz.map((h) => (
                <tr key={h.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{h.student_id ? studentById.get(h.student_id) ?? '—' : '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{h.juz_number ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{h.surah || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{h.ayah_range || '—'}</td>
                  <td className="px-4 py-3"><span className={`rounded px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[h.status] ?? 'bg-gray-100 text-gray-600'}`}>{h.status}</span></td>
                  <td className="px-4 py-3 text-gray-500">{h.assessed_on || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{h.assessor_id ? assessorById.get(h.assessor_id) ?? '—' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

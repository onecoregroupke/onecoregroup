import { getRhythmsAdminData } from '@/lib/management'
import { RhythmsQuickAdd } from '@/components/rhythms/RhythmsQuickAdd'

export const dynamic = 'force-dynamic'

export default async function RhythmsAdmissionsPage() {
  const { admissions, students, guardians } = await getRhythmsAdminData()
  const studentById = new Map(students.map((s) => [s.id, s.full_name]))
  const guardianById = new Map(guardians.map((g) => [g.id, g.full_name]))
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Rhythms admissions</h1>
        <p className="text-sm text-gray-500">Enquiry-to-enrolment pipeline with follow-up dates and fee status.</p>
      </div>
      <RhythmsQuickAdd />
      <section className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
        {admissions.length === 0 ? <p className="p-6 text-sm text-gray-500">No admissions in the pipeline yet.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
              <th className="px-4 py-3">Student / enquiry</th><th className="px-4 py-3">Guardian</th><th className="px-4 py-3">Pipeline</th>
              <th className="px-4 py-3">Documents</th><th className="px-4 py-3">Fee status</th><th className="px-4 py-3">Next follow-up</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">{admissions.map((a) => (
              <tr key={a.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{a.student_id ? studentById.get(a.student_id) ?? 'Enquiry' : 'Enquiry'}</td>
                <td className="px-4 py-3 text-gray-500">{a.guardian_id ? guardianById.get(a.guardian_id) ?? '—' : '—'}</td>
                <td className="px-4 py-3 text-gray-500">{a.pipeline_status}</td>
                <td className="px-4 py-3 text-gray-500">{a.documents_status}</td>
                <td className="px-4 py-3 text-gray-500">{a.schoolpay_status}</td>
                <td className="px-4 py-3 text-gray-500">{a.next_follow_up_date || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </div>
  )
}

import { getRayyanAdminData } from '@/lib/management'

export const dynamic = 'force-dynamic'

export default async function RayyanFeeFollowupsPage() {
  const { feeFollowups, students } = await getRayyanAdminData()
  const studentById = new Map(students.map((s) => [s.id, s.full_name]))
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-semibold text-gray-900">Fee follow-ups</h1><p className="text-sm text-gray-500">This view tracks internal fee follow-up and admin status.</p></div>
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        {feeFollowups.length === 0 ? <p className="p-6 text-sm text-gray-500">No fee follow-ups yet.</p> : <table className="w-full text-sm"><thead><tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400"><th className="px-4 py-3">Student</th><th className="px-4 py-3">Fee item</th><th className="px-4 py-3">Last known status</th><th className="px-4 py-3">Next follow-up</th></tr></thead><tbody className="divide-y divide-gray-50">{feeFollowups.map((f) => <tr key={f.id} className="hover:bg-gray-50"><td className="px-4 py-3 font-medium text-gray-800">{f.student_id ? studentById.get(f.student_id) ?? 'Student' : f.schoolpay_code || 'Unlinked'}</td><td className="px-4 py-3 text-gray-500">{f.expected_fee_item || '—'}</td><td className="px-4 py-3 text-gray-500">{f.last_known_fee_status || f.follow_up_status}</td><td className="px-4 py-3 text-gray-500">{f.next_follow_up_date || '—'}</td></tr>)}</tbody></table>}
      </div>
    </div>
  )
}

import { getRayyanAdminData } from '@/lib/management'

export const dynamic = 'force-dynamic'

export default async function RayyanAdmissionsPage() {
  const { admissions, students } = await getRayyanAdminData()
  const studentById = new Map(students.map((s) => [s.id, s.full_name]))
  return <Simple title="Admissions pipeline" description="Enquiries, tours, documents, fee/payment-pending state, and enrollment follow-up." rows={admissions.map((a) => ({ id: a.id, main: a.student_id ? studentById.get(a.student_id) ?? 'Student' : 'Unlinked enquiry', sub: `${a.pipeline_status} · documents ${a.documents_status}`, meta: a.next_follow_up_date || a.schoolpay_status || '—' }))} empty="No admissions records yet." />
}

function Simple({ title, description, rows, empty }: { title: string; description: string; rows: { id: string; main: string; sub: string; meta: string }[]; empty: string }) {
  return <div className="space-y-5"><div><h1 className="text-2xl font-semibold text-gray-900">{title}</h1><p className="text-sm text-gray-500">{description}</p></div><div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">{rows.length === 0 ? <p className="text-sm text-gray-500">{empty}</p> : <ul className="divide-y divide-gray-100">{rows.map((r) => <li key={r.id} className="flex justify-between gap-3 py-3"><div><p className="text-sm font-medium text-gray-800">{r.main}</p><p className="text-xs text-gray-400">{r.sub}</p></div><span className="text-xs text-gray-500">{r.meta}</span></li>)}</ul>}</div></div>
}

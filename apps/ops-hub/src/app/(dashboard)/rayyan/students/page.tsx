import Link from 'next/link'
import { getRayyanAdminData } from '@/lib/management'
import { RayyanActionPanel } from '@/components/rayyan/RayyanActionPanel'

export const dynamic = 'force-dynamic'

export default async function RayyanStudentsPage() {
  const { students, guardians, invoices, team } = await getRayyanAdminData()
  const guardianById = new Map(guardians.map((g) => [g.id, g.full_name]))
  return (
    <List title="Rayyan students" description="Student records, class level, enrollment state, and SchoolPay/admission references.">
      <RayyanActionPanel
        guardians={guardians.map((guardian) => ({ id: guardian.id, label: guardian.full_name }))}
        students={students.map((student) => ({ id: student.id, label: student.full_name }))}
        invoices={invoices.map((invoice) => ({
          id: invoice.id,
          label: `${invoice.fee_item} ${invoice.term || ''} - KSh ${Number(invoice.balance_ksh ?? 0).toLocaleString()} due`,
        }))}
        team={team.map((member) => ({ id: member.id, label: member.name }))}
      />
      <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        {students.length === 0 ? <Empty>No student records yet.</Empty> : <table className="w-full text-sm"><thead><tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400"><th className="px-4 py-3">Student</th><th className="px-4 py-3">Guardian</th><th className="px-4 py-3">Class</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">SchoolPay</th></tr></thead><tbody className="divide-y divide-gray-50">{students.map((s) => <tr key={s.id} className="hover:bg-gray-50"><td className="px-4 py-3 font-medium text-gray-800"><Link href={`/rayyan/students/${s.id}`} className="hover:text-ocg-gold hover:underline">{s.full_name}</Link></td><td className="px-4 py-3 text-gray-500">{s.guardian_id ? guardianById.get(s.guardian_id) ?? 'Guardian' : '—'}</td><td className="px-4 py-3 text-gray-500">{s.class_level || '—'}</td><td className="px-4 py-3 text-gray-500">{s.enrollment_status}</td><td className="px-4 py-3 text-gray-500">{s.schoolpay_code || s.admission_number || '—'}</td></tr>)}</tbody></table>}
      </section>
    </List>
  )
}

function List({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <div className="space-y-5"><div><h1 className="text-2xl font-semibold text-gray-900">{title}</h1><p className="text-sm text-gray-500">{description}</p></div>{children}</div> }
function Empty({ children }: { children: React.ReactNode }) { return <p className="p-6 text-sm text-gray-500">{children}</p> }

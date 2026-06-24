import { getRayyanAdminData } from '@/lib/management'

export const dynamic = 'force-dynamic'

export default async function RayyanParentsPage() {
  const { guardians } = await getRayyanAdminData()
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-semibold text-gray-900">Parents & guardians</h1><p className="text-sm text-gray-500">Guardian contacts, communication preference, and follow-up notes.</p></div>
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        {guardians.length === 0 ? <p className="p-6 text-sm text-gray-500">No parent or guardian records yet.</p> : <table className="w-full text-sm"><thead><tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400"><th className="px-4 py-3">Name</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Relationship</th><th className="px-4 py-3">Channel</th></tr></thead><tbody className="divide-y divide-gray-50">{guardians.map((g) => <tr key={g.id} className="hover:bg-gray-50"><td className="px-4 py-3 font-medium text-gray-800">{g.full_name}</td><td className="px-4 py-3 text-gray-500">{g.phone || g.email || '—'}</td><td className="px-4 py-3 text-gray-500">{g.relationship_to_child || '—'}</td><td className="px-4 py-3 text-gray-500">{g.preferred_communication_channel || '—'}</td></tr>)}</tbody></table>}
      </div>
    </div>
  )
}

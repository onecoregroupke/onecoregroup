import { getRhythmsAdminData } from '@/lib/management'
import { RhythmsQuickAdd } from '@/components/rhythms/RhythmsQuickAdd'

export const dynamic = 'force-dynamic'

export default async function RhythmsParentsPage() {
  const { guardians } = await getRhythmsAdminData()
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Rhythms parents</h1>
        <p className="text-sm text-gray-500">Guardians and their preferred contact channels.</p>
      </div>
      <RhythmsQuickAdd />
      <section className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
        {guardians.length === 0 ? <p className="p-6 text-sm text-gray-500">No parents/guardians yet.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
              <th className="px-4 py-3">Parent / guardian</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Relationship</th><th className="px-4 py-3">Channel</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">{guardians.map((g) => (
              <tr key={g.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{g.full_name}</td>
                <td className="px-4 py-3 text-gray-500">{g.phone || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{g.email || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{g.relationship_to_child || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{g.preferred_communication_channel || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </div>
  )
}

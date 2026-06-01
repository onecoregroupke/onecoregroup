import { listClients } from '@/lib/clients'
import { NewClientButton } from '@/components/clients/NewClientButton'

export const dynamic = 'force-dynamic'

export default async function ClientsPage() {
  const clients = await listClients()

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">External clients</h1>
          <p className="text-sm text-gray-500">
            {clients.length} total · internal brand work lives under Projects
          </p>
        </div>
        <NewClientButton />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        {clients.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">
            No external clients yet. The 6 brands are managed under Projects/Tasks directly.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Industry</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {clients.map((c) => (
                <tr key={c.client_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{c.client_name}</p>
                    <p className="text-xs text-gray-400">{c.client_id}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.industry || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{c.country_city || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{c.relationship_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

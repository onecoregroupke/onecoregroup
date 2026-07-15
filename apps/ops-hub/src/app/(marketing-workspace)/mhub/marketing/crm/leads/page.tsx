'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus } from 'lucide-react'
import { usePermissions } from '@/contexts/PermissionsContext'
import { apiFetch } from '@/lib/marketing/client'
import { CrmNav } from '@/components/marketing/CrmNav'
import type { LeadToPromote, MarketingContact } from '@/lib/marketing/types'

function dt(iso: string): string {
  return new Date(iso).toLocaleDateString('en-KE', { dateStyle: 'medium' })
}

export default function PromoteLeadsPage() {
  const router = useRouter()
  const { can, isAdmin } = usePermissions()
  const canEdit = isAdmin || can('marketing', 'edit')
  const [leads, setLeads] = useState<LeadToPromote[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const { leads: l } = await apiFetch<{ leads: LeadToPromote[] }>('/api/mhub/marketing/leads')
      setLeads(l ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leads.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function promote(leadId: string) {
    setBusyId(leadId)
    setError('')
    try {
      const { contact } = await apiFetch<{ contact: MarketingContact }>('/api/mhub/marketing/leads', {
        method: 'POST',
        body: JSON.stringify({ leadId }),
      })
      router.push(`/mhub/marketing/crm/contacts/${contact.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to promote lead.')
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-bold text-2xl text-gray-900">CRM</h1>
        <p className="text-gray-500 text-sm mt-1">Leads captured on your sites that aren’t yet contacts.</p>
      </div>
      <CrmNav />

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Name</th>
              <th className="px-5 py-3 font-semibold">Email</th>
              <th className="px-5 py-3 font-semibold">Source</th>
              <th className="px-5 py-3 font-semibold">Captured</th>
              {canEdit && <th className="px-5 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={5} className="px-5 py-6 text-gray-400">Loading…</td></tr>
            ) : leads.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-6 text-gray-400">No leads waiting to be promoted.</td></tr>
            ) : (
              leads.map((l) => (
                <tr key={l.leadId} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{l.name || '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{l.email || '—'}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{l.source || l.brandSlug || '—'}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{dt(l.capturedAt)}</td>
                  {canEdit && (
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => promote(l.leadId)}
                        disabled={busyId === l.leadId}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                      >
                        <UserPlus size={14} /> {busyId === l.leadId ? 'Promoting…' : 'Promote'}
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

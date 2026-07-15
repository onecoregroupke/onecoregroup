'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { usePermissions } from '@/contexts/PermissionsContext'
import { apiFetch } from '@/lib/marketing/client'
import {
  WHATSAPP_FLOW_STATUS_LABELS,
  WHATSAPP_TRIGGER_LABELS,
  type MarketingBrand,
  type WhatsappFlow,
  type WhatsappFlowStatus,
} from '@/lib/marketing/types'

const STATUS_BADGE: Record<WhatsappFlowStatus, string> = {
  drafting: 'bg-slate-100 text-slate-700',
  active: 'bg-green-50 text-green-700',
  paused: 'bg-amber-50 text-amber-700',
  archived: 'bg-gray-100 text-gray-400',
}

export default function WhatsappFlowsPage() {
  const { can, isAdmin } = usePermissions()
  const canEdit = isAdmin || can('marketing', 'edit')
  const [flows, setFlows] = useState<WhatsappFlow[]>([])
  const [brands, setBrands] = useState<MarketingBrand[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const brandName = useMemo(() => {
    const m = new Map(brands.map((b) => [b.id, b.shortName ?? b.name]))
    return (id: string) => m.get(id) ?? '—'
  }, [brands])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        const [f, b] = await Promise.all([
          apiFetch<{ flows: WhatsappFlow[] }>('/api/mhub/marketing/whatsapp?includeArchived=true'),
          apiFetch<{ brands: MarketingBrand[] }>('/api/mhub/marketing/brands'),
        ])
        setFlows(f.flows ?? [])
        setBrands(b.brands ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load flows.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-bold text-2xl text-gray-900">WhatsApp Flows</h1>
          <p className="text-gray-500 text-sm mt-1">
            Authored conversation flows — triggers and a JSON definition you reference when wiring automations.
          </p>
        </div>
        {canEdit && (
          <Link href="/mhub/marketing/whatsapp/new" className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            <Plus size={16} /> New flow
          </Link>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Name</th>
              <th className="px-5 py-3 font-semibold">Brand</th>
              <th className="px-5 py-3 font-semibold">Trigger</th>
              <th className="px-5 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={4} className="px-5 py-6 text-gray-400">Loading…</td></tr>
            ) : flows.length === 0 ? (
              <tr><td colSpan={4} className="px-5 py-6 text-gray-400">No flows yet.</td></tr>
            ) : (
              flows.map((f) => (
                <tr key={f.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <Link href={`/mhub/marketing/whatsapp/${f.id}`} className="font-medium text-gray-900 hover:text-ocg-navy">{f.name}</Link>
                    {f.triggerKeywords.length > 0 && (
                      <div className="text-xs text-gray-400">{f.triggerKeywords.join(', ')}</div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-600">{brandName(f.brandId)}</td>
                  <td className="px-5 py-3 text-gray-600">{WHATSAPP_TRIGGER_LABELS[f.triggerType]}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[f.status]}`}>
                      {WHATSAPP_FLOW_STATUS_LABELS[f.status]}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

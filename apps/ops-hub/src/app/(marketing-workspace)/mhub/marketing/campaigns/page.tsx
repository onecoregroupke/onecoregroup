'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { usePermissions } from '@/contexts/PermissionsContext'
import { apiFetch } from '@/lib/marketing/client'
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABELS,
  type CampaignStatus,
  type MarketingBrand,
  type MarketingCampaign,
} from '@/lib/marketing/types'

const STATUS_BADGE: Record<CampaignStatus, string> = {
  planning: 'bg-slate-100 text-slate-700',
  live: 'bg-green-50 text-green-700',
  paused: 'bg-amber-50 text-amber-700',
  completed: 'bg-blue-50 text-blue-700',
  cancelled: 'bg-gray-100 text-gray-400',
}

function shortDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })
}

export default function CampaignsPage() {
  const { can, isAdmin } = usePermissions()
  const canEdit = isAdmin || can('marketing', 'edit')
  const [brands, setBrands] = useState<MarketingBrand[]>([])
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([])
  const [statusFilter, setStatusFilter] = useState('open')
  const [brandFilter, setBrandFilter] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const brandName = useMemo(() => {
    const m = new Map(brands.map((b) => [b.id, b.shortName ?? b.name]))
    return (id: string) => m.get(id) ?? '—'
  }, [brands])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (brandFilter) params.set('brand', brandFilter)
      if (query.trim()) params.set('q', query.trim())
      const [b, c] = await Promise.all([
        brands.length ? Promise.resolve({ brands }) : apiFetch<{ brands: MarketingBrand[] }>('/api/mhub/marketing/brands'),
        apiFetch<{ campaigns: MarketingCampaign[] }>(`/api/mhub/marketing/campaigns?${params.toString()}`),
      ])
      setBrands(b.brands ?? [])
      setCampaigns(c.campaigns ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load campaigns.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, brandFilter])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-bold text-2xl text-gray-900">Campaigns</h1>
          <p className="text-gray-500 text-sm mt-1">
            Bounded units of work — a goal, an audience, a window. Attach content to track delivery.
          </p>
        </div>
        {canEdit && (
          <Link
            href="/mhub/marketing/campaigns/new"
            className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus size={16} /> New campaign
          </Link>
        )}
      </div>

      <div className="grid gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:grid-cols-[1fr_1fr_2fr_auto]">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputCls}>
          <option value="open">Open (planning, live, paused)</option>
          <option value="any">All statuses</option>
          {CAMPAIGN_STATUSES.map((s) => <option key={s} value={s}>{CAMPAIGN_STATUS_LABELS[s]}</option>)}
        </select>
        <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className={inputCls}>
          <option value="">All brands</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <input
          value={query}
          placeholder="Search name, goal, notes…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void load() }}
          className={inputCls}
        />
        <button onClick={() => void load()} className="rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          Search
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Name</th>
              <th className="px-5 py-3 font-semibold">Brand</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold">Window</th>
              <th className="px-5 py-3 font-semibold">UTM</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={5} className="px-5 py-6 text-gray-400">Loading…</td></tr>
            ) : campaigns.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-6 text-gray-400">No campaigns match these filters.</td></tr>
            ) : (
              campaigns.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <Link href={`/mhub/marketing/campaigns/${c.id}`} className="font-medium text-gray-900 hover:text-ocg-navy">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{brandName(c.brandId)}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[c.status]}`}>
                      {CAMPAIGN_STATUS_LABELS[c.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{shortDate(c.startDate)} → {shortDate(c.endDate)}</td>
                  <td className="px-5 py-3 text-gray-500 font-mono text-xs">{c.utmCampaign ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-ocg-navy'

'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { usePermissions } from '@/contexts/PermissionsContext'
import { apiFetch } from '@/lib/marketing/client'
import {
  CONTENT_STATUSES,
  CONTENT_STATUS_LABELS,
  CONTENT_TYPE_LABELS,
  type ContentStatus,
  type MarketingBrand,
  type MarketingContent,
} from '@/lib/marketing/types'

const STATUS_BADGE: Partial<Record<ContentStatus, string>> = {
  idea: 'bg-gray-100 text-gray-600',
  draft: 'bg-slate-100 text-slate-700',
  review: 'bg-amber-50 text-amber-700',
  approved: 'bg-blue-50 text-blue-700',
  scheduled: 'bg-indigo-50 text-indigo-700',
  published: 'bg-green-50 text-green-700',
  reported: 'bg-teal-50 text-teal-700',
  archived: 'bg-gray-100 text-gray-400',
  publish_failed: 'bg-red-50 text-red-700',
}

function eatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-KE', {
    timeZone: 'Africa/Nairobi',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ContentListPage() {
  const { can, isAdmin } = usePermissions()
  const canEdit = isAdmin || can('marketing', 'edit')
  const [brands, setBrands] = useState<MarketingBrand[]>([])
  const [items, setItems] = useState<MarketingContent[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [brandFilter, setBrandFilter] = useState<string>('')
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
      else params.set('status', 'any')
      if (brandFilter) params.set('brand', brandFilter)
      if (query.trim()) params.set('q', query.trim())
      const [b, c] = await Promise.all([
        brands.length ? Promise.resolve({ brands }) : apiFetch<{ brands: MarketingBrand[] }>('/api/mhub/marketing/brands'),
        apiFetch<{ content: MarketingContent[] }>(`/api/mhub/marketing/content?${params.toString()}`),
      ])
      setBrands(b.brands ?? [])
      setItems(c.content ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load content.')
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
          <h1 className="font-bold text-2xl text-gray-900">Content</h1>
          <p className="text-gray-500 text-sm mt-1">Every planned, scheduled, and published post.</p>
        </div>
        {canEdit && (
          <Link
            href="/mhub/marketing/content/new"
            className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus size={16} /> New content
          </Link>
        )}
      </div>

      <div className="grid gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:grid-cols-[1fr_1fr_2fr_auto]">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputCls}>
          <option value="">All statuses</option>
          {CONTENT_STATUSES.map((s) => <option key={s} value={s}>{CONTENT_STATUS_LABELS[s]}</option>)}
        </select>
        <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className={inputCls}>
          <option value="">All brands</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <input
          value={query}
          placeholder="Search title, hook, body…"
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
              <th className="px-5 py-3 font-semibold">Title</th>
              <th className="px-5 py-3 font-semibold">Brand</th>
              <th className="px-5 py-3 font-semibold">Type</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold">Scheduled</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={5} className="px-5 py-6 text-gray-400">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-6 text-gray-400">No content matches.</td></tr>
            ) : (
              items.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <Link href={`/mhub/marketing/content/${c.id}/edit`} className="font-medium text-gray-900 hover:text-ocg-navy">
                      {c.title || c.hook || 'Untitled'}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{brandName(c.brandId)}</td>
                  <td className="px-5 py-3 text-gray-600">{CONTENT_TYPE_LABELS[c.contentType]}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[c.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {CONTENT_STATUS_LABELS[c.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{eatDate(c.scheduledAt)}</td>
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

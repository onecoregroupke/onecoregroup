'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { usePermissions } from '@/contexts/PermissionsContext'
import { apiFetch } from '@/lib/marketing/client'
import type { MarketingBrand } from '@/lib/marketing/types'
import {
  EPISODE_STATUSES,
  EPISODE_STATUS_LABELS,
  type EpisodeStatus,
  type MarketingEpisode,
} from '@/lib/marketing/episodeTypes'

const STATUS_BADGE: Record<EpisodeStatus, string> = {
  idea: 'bg-slate-100 text-slate-700',
  recording: 'bg-purple-50 text-purple-700',
  editing: 'bg-amber-50 text-amber-700',
  scheduled: 'bg-blue-50 text-blue-700',
  published: 'bg-green-50 text-green-700',
  archived: 'bg-gray-100 text-gray-400',
}

function shortDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function EpisodesPage() {
  const { can, isAdmin } = usePermissions()
  const canEdit = isAdmin || can('marketing', 'edit')
  const [brands, setBrands] = useState<MarketingBrand[]>([])
  const [episodes, setEpisodes] = useState<MarketingEpisode[]>([])
  const [brandFilter, setBrandFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('any')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showNew, setShowNew] = useState(false)

  const brandName = useMemo(() => {
    const m = new Map(brands.map((b) => [b.id, b.shortName ?? b.name]))
    return (id: string) => m.get(id) ?? '—'
  }, [brands])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (brandFilter) params.set('brand', brandFilter)
      if (statusFilter && statusFilter !== 'any') params.set('status', statusFilter)
      const [b, e] = await Promise.all([
        brands.length ? Promise.resolve({ brands }) : apiFetch<{ brands: MarketingBrand[] }>('/api/mhub/marketing/brands'),
        apiFetch<{ episodes: MarketingEpisode[] }>(`/api/mhub/marketing/episodes?${params.toString()}`),
      ])
      setBrands(b.brands ?? [])
      setEpisodes(e.episodes ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load episodes.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandFilter, statusFilter])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-bold text-2xl text-gray-900">Episodes</h1>
          <p className="text-gray-500 text-sm mt-1">
            Long-form anchors (YouTube + podcast). Each episode spawns short-form clips across platforms.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus size={16} /> New episode
          </button>
        )}
      </div>

      <div className="grid gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:grid-cols-2">
        <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className={inputCls}>
          <option value="">All brands</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputCls}>
          <option value="any">All statuses</option>
          {EPISODE_STATUSES.map((s) => <option key={s} value={s}>{EPISODE_STATUS_LABELS[s]}</option>)}
        </select>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-3 font-semibold">#</th>
              <th className="px-5 py-3 font-semibold">Title</th>
              <th className="px-5 py-3 font-semibold">Brand</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold">Publish</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={5} className="px-5 py-6 text-gray-400">Loading…</td></tr>
            ) : episodes.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-6 text-gray-400">No episodes yet.</td></tr>
            ) : (
              episodes.map((ep) => (
                <tr key={ep.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-gray-500">{ep.number ?? '—'}</td>
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-900">{ep.title}</p>
                    {ep.guestName && <p className="text-xs text-gray-400">with {ep.guestName}</p>}
                  </td>
                  <td className="px-5 py-3 text-gray-600">{brandName(ep.brandId)}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[ep.status]}`}>
                      {EPISODE_STATUS_LABELS[ep.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{shortDate(ep.publishDate)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showNew && (
        <NewEpisodeModal
          brands={brands}
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false)
            void load()
          }}
        />
      )}
    </div>
  )
}

function NewEpisodeModal({
  brands,
  onClose,
  onCreated,
}: {
  brands: MarketingBrand[]
  onClose: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState({
    brandId: brands[0]?.id ?? '',
    title: '',
    number: '',
    hook: '',
    guestName: '',
    recordDate: '',
    publishDate: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setError('')
    if (!form.brandId || !form.title) return setError('Brand and title are required.')
    setSaving(true)
    try {
      await apiFetch('/api/mhub/marketing/episodes', {
        method: 'POST',
        body: JSON.stringify({
          brandId: form.brandId,
          title: form.title,
          number: form.number ? Number(form.number) : null,
          hook: form.hook || null,
          guestName: form.guestName || null,
          recordDate: form.recordDate || null,
          publishDate: form.publishDate || null,
        }),
      })
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create episode.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">New episode</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <select value={form.brandId} onChange={(e) => setForm((f) => ({ ...f, brandId: e.target.value }))} className={inputCls}>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <input
              className={`${inputCls} w-20`}
              placeholder="No."
              value={form.number}
              onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
            />
          </div>
          <input className={inputCls} placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <input className={inputCls} placeholder="Hook (one line)" value={form.hook} onChange={(e) => setForm((f) => ({ ...f, hook: e.target.value }))} />
          <input className={inputCls} placeholder="Guest name (optional)" value={form.guestName} onChange={(e) => setForm((f) => ({ ...f, guestName: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-gray-500">Record date
              <input type="date" className={inputCls} value={form.recordDate} onChange={(e) => setForm((f) => ({ ...f, recordDate: e.target.value }))} />
            </label>
            <label className="text-xs text-gray-500">Publish date
              <input type="date" className={inputCls} value={form.publishDate} onChange={(e) => setForm((f) => ({ ...f, publishDate: e.target.value }))} />
            </label>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600">Cancel</button>
          <button onClick={submit} disabled={saving} className="rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
            {saving ? 'Creating…' : 'Create episode'}
          </button>
        </div>
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-ocg-navy'

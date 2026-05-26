'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle, Plus, Save, Archive } from 'lucide-react'
import { usePermissions } from '@/contexts/PermissionsContext'
import { apiFetch } from '@/lib/marketing/client'
import {
  PLATFORM_KINDS,
  PLATFORM_LABELS,
  PLATFORM_HEALTH_VALUES,
  PLATFORM_HEALTH_LABELS,
  POSTING_MODES,
  POSTING_MODE_LABELS,
  type MarketingBrand,
  type MarketingPlatform,
} from '@/lib/marketing/types'

type PlatformForm = {
  id?: string
  brandId: string
  platform: string
  handle: string
  monthlyPostTarget: string
  currentHealth: string
  postingMode: string
  isActive: boolean
}

const EMPTY: PlatformForm = {
  brandId: '',
  platform: 'instagram',
  handle: '',
  monthlyPostTarget: '0',
  currentHealth: 'healthy',
  postingMode: 'remind_only',
  isActive: true,
}

function toForm(p: MarketingPlatform): PlatformForm {
  return {
    id: p.id,
    brandId: p.brandId,
    platform: p.platform,
    handle: p.handle ?? '',
    monthlyPostTarget: p.monthlyPostTarget.toString(),
    currentHealth: p.currentHealth,
    postingMode: p.postingMode,
    isActive: p.isActive,
  }
}

const HEALTH_BADGE: Record<string, string> = {
  healthy: 'bg-green-50 text-green-700',
  needs_attention: 'bg-amber-50 text-amber-700',
  dormant: 'bg-gray-100 text-gray-500',
}

export default function PlatformsPage() {
  const { can, isAdmin } = usePermissions()
  const canEdit = isAdmin || can('marketing', 'edit')
  const [brands, setBrands] = useState<MarketingBrand[]>([])
  const [platforms, setPlatforms] = useState<MarketingPlatform[]>([])
  const [form, setForm] = useState<PlatformForm>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const brandName = useMemo(() => {
    const m = new Map(brands.map((b) => [b.id, b.shortName ?? b.name]))
    return (id: string) => m.get(id) ?? 'Unknown brand'
  }, [brands])

  function update<K extends keyof PlatformForm>(key: K, value: PlatformForm[K]) {
    setForm((c) => ({ ...c, [key]: value }))
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [b, p] = await Promise.all([
        apiFetch<{ brands: MarketingBrand[] }>('/api/marketing/brands'),
        apiFetch<{ platforms: MarketingPlatform[] }>('/api/marketing/platforms?includeInactive=true'),
      ])
      setBrands(b.brands ?? [])
      setPlatforms(p.platforms ?? [])
      if (!form.brandId && b.brands?.[0]) update('brandId', b.brands[0].id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load platforms.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function save() {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      if (!form.brandId) throw new Error('Brand is required.')
      const json = await apiFetch<{ platform: MarketingPlatform }>('/api/marketing/platforms', {
        method: form.id ? 'PATCH' : 'POST',
        body: JSON.stringify({
          id: form.id,
          brandId: form.brandId,
          platform: form.platform,
          handle: form.handle.trim() || null,
          monthlyPostTarget: Number(form.monthlyPostTarget) || 0,
          currentHealth: form.currentHealth,
          postingMode: form.postingMode,
          isActive: form.isActive,
        }),
      })
      const saved = json.platform
      setPlatforms((cur) => {
        const exists = cur.some((p) => p.id === saved.id)
        return exists ? cur.map((p) => (p.id === saved.id ? saved : p)) : [...cur, saved]
      })
      setForm(toForm(saved))
      setMessage('Platform saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save platform.')
    } finally {
      setSaving(false)
    }
  }

  async function archive(id: string) {
    setError('')
    try {
      await apiFetch('/api/marketing/platforms', {
        method: 'PATCH',
        body: JSON.stringify({ id, archive: true }),
      })
      await load()
      if (form.id === id) setForm(EMPTY)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive platform.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-bold text-2xl text-gray-900">Platforms</h1>
          <p className="text-gray-500 text-sm mt-1">
            One row per brand account, with its monthly posting cadence target.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => { setForm({ ...EMPTY, brandId: brands[0]?.id ?? '' }); setMessage(''); setError('') }}
            className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus size={16} /> New
          </button>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-3">
            <p className="text-sm font-semibold text-gray-900">All platforms</p>
          </div>
          <div className="divide-y divide-gray-50">
            {loading ? (
              <p className="p-5 text-sm text-gray-400">Loading platforms…</p>
            ) : platforms.length === 0 ? (
              <p className="p-5 text-sm text-gray-400">No platforms yet. Add one to start scheduling.</p>
            ) : (
              platforms.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setForm(toForm(p)); setMessage(''); setError('') }}
                  className={`flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 ${
                    form.id === p.id ? 'bg-gray-50' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {brandName(p.brandId)} · {PLATFORM_LABELS[p.platform]}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {p.handle || '—'} · target {p.monthlyPostTarget}/mo
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${HEALTH_BADGE[p.currentHealth] ?? 'bg-gray-100 text-gray-500'}`}>
                    {PLATFORM_HEALTH_LABELS[p.currentHealth] ?? p.currentHealth}
                  </span>
                  {!p.isActive && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">Inactive</span>
                  )}
                </button>
              ))
            )}
          </div>
        </section>

        {canEdit && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm h-fit">
            <div className="border-b border-gray-100 px-5 py-4">
              <p className="text-sm font-semibold text-gray-900">
                {form.id ? 'Edit platform' : 'Add Platform'}
              </p>
            </div>
            <div className="p-5 space-y-4">
              {message && (
                <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
                  <CheckCircle size={16} /> {message}
                </div>
              )}
              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle size={16} /> {error}
                </div>
              )}

              <Field label="Brand">
                <select
                  value={form.brandId}
                  onChange={(e) => update('brandId', e.target.value)}
                  disabled={Boolean(form.id)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocg-navy disabled:bg-gray-50"
                >
                  <option value="">Select brand…</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Platform">
                <select
                  value={form.platform}
                  onChange={(e) => update('platform', e.target.value)}
                  disabled={Boolean(form.id)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocg-navy disabled:bg-gray-50"
                >
                  {PLATFORM_KINDS.map((k) => (
                    <option key={k} value={k}>{PLATFORM_LABELS[k]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Handle">
                <input
                  value={form.handle}
                  onChange={(e) => update('handle', e.target.value)}
                  placeholder="@yourbrand"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocg-navy"
                />
              </Field>
              <Field label="Monthly post target">
                <input
                  type="number"
                  value={form.monthlyPostTarget}
                  onChange={(e) => update('monthlyPostTarget', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocg-navy"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Health">
                  <select
                    value={form.currentHealth}
                    onChange={(e) => update('currentHealth', e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocg-navy"
                  >
                    {PLATFORM_HEALTH_VALUES.map((h) => (
                      <option key={h} value={h}>{PLATFORM_HEALTH_LABELS[h]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Posting mode">
                  <select
                    value={form.postingMode}
                    onChange={(e) => update('postingMode', e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocg-navy"
                  >
                    {POSTING_MODES.map((m) => (
                      <option key={m} value={m}>{POSTING_MODE_LABELS[m]}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => update('isActive', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Active
              </label>

              <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                {form.id ? (
                  <button
                    onClick={() => form.id && archive(form.id)}
                    className="inline-flex items-center gap-2 text-sm text-red-600 hover:text-red-700"
                  >
                    <Archive size={15} /> Deactivate
                  </button>
                ) : <span />}
                <button
                  onClick={save}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                >
                  <Save size={16} /> {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  )
}

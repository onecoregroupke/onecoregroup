'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle, Plus, Save, Archive } from 'lucide-react'
import { usePermissions } from '@/contexts/PermissionsContext'
import { apiFetch } from '@/lib/marketing/client'
import type { MarketingPillar } from '@/lib/marketing/types'

type PillarForm = {
  id?: string
  name: string
  description: string
  colorHex: string
  targetSharePct: string
  sortOrder: string
  isActive: boolean
}

const EMPTY: PillarForm = {
  name: '',
  description: '',
  colorHex: '#1a1a2e',
  targetSharePct: '',
  sortOrder: '100',
  isActive: true,
}

function toForm(p: MarketingPillar): PillarForm {
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? '',
    colorHex: p.colorHex,
    targetSharePct: p.targetSharePct?.toString() ?? '',
    sortOrder: p.sortOrder.toString(),
    isActive: p.isActive,
  }
}

function numOrNull(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export default function PillarsPage() {
  const { can, isAdmin } = usePermissions()
  const canEdit = isAdmin || can('marketing', 'edit')
  const [pillars, setPillars] = useState<MarketingPillar[]>([])
  const [form, setForm] = useState<PillarForm>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  function update<K extends keyof PillarForm>(key: K, value: PillarForm[K]) {
    setForm((c) => ({ ...c, [key]: value }))
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      const json = await apiFetch<{ pillars: MarketingPillar[] }>(
        '/api/marketing/pillars?includeInactive=true',
      )
      setPillars(json.pillars ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pillars.')
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
      const payload = {
        id: form.id,
        name: form.name.trim(),
        description: form.description.trim() || null,
        colorHex: form.colorHex,
        targetSharePct: numOrNull(form.targetSharePct),
        sortOrder: numOrNull(form.sortOrder) ?? 100,
        isActive: form.isActive,
      }
      if (!payload.name) throw new Error('Name is required.')
      const json = await apiFetch<{ pillar: MarketingPillar }>('/api/marketing/pillars', {
        method: form.id ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      })
      const saved = json.pillar
      setPillars((cur) => {
        const exists = cur.some((p) => p.id === saved.id)
        return exists ? cur.map((p) => (p.id === saved.id ? saved : p)) : [...cur, saved]
      })
      setForm(toForm(saved))
      setMessage('Pillar saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save pillar.')
    } finally {
      setSaving(false)
    }
  }

  async function archive(id: string) {
    setError('')
    try {
      await apiFetch('/api/marketing/pillars', {
        method: 'PATCH',
        body: JSON.stringify({ id, archive: true }),
      })
      await load()
      if (form.id === id) setForm(EMPTY)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive pillar.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-bold text-2xl text-gray-900">Content Pillars</h1>
          <p className="text-gray-500 text-sm mt-1">
            The taxonomy your content tags into. The calendar colours each post by its first pillar.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => { setForm(EMPTY); setMessage(''); setError('') }}
            className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus size={16} /> New
          </button>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-3">
            <p className="text-sm font-semibold text-gray-900">All pillars</p>
          </div>
          <div className="divide-y divide-gray-50">
            {loading ? (
              <p className="p-5 text-sm text-gray-400">Loading pillars…</p>
            ) : pillars.length === 0 ? (
              <p className="p-5 text-sm text-gray-400">No pillars yet.</p>
            ) : (
              pillars.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setForm(toForm(p)); setMessage(''); setError('') }}
                  className={`flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 ${
                    form.id === p.id ? 'bg-gray-50' : ''
                  }`}
                >
                  <span className="h-4 w-4 rounded-full flex-shrink-0" style={{ backgroundColor: p.colorHex }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{p.name}</p>
                    {p.description && <p className="truncate text-xs text-gray-500">{p.description}</p>}
                  </div>
                  {p.targetSharePct != null && (
                    <span className="text-xs text-gray-400">{p.targetSharePct}%</span>
                  )}
                  {!p.isActive && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">Archived</span>
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
                {form.id ? `Editing ${form.name || 'pillar'}` : 'Create Pillar'}
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

              <Field label="Name">
                <input
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocg-navy"
                />
              </Field>
              <Field label="Description">
                <textarea
                  value={form.description}
                  rows={3}
                  onChange={(e) => update('description', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocg-navy"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Colour">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.colorHex}
                      onChange={(e) => update('colorHex', e.target.value)}
                      className="h-9 w-12 rounded border border-gray-200"
                    />
                    <input
                      value={form.colorHex}
                      onChange={(e) => update('colorHex', e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm font-mono"
                    />
                  </div>
                </Field>
                <Field label="Target share %">
                  <input
                    type="number"
                    value={form.targetSharePct}
                    onChange={(e) => update('targetSharePct', e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocg-navy"
                  />
                </Field>
              </div>
              <Field label="Sort order">
                <input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => update('sortOrder', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocg-navy"
                />
              </Field>
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
                    <Archive size={15} /> Archive
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

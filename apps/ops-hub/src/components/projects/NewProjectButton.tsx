'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { api } from '@/lib/apiClient'

export function NewProjectButton({
  brands,
  clients,
  parents = [],
}: {
  brands: { slug: string; name: string }[]
  clients: { id: string; name: string }[]
  /** Top-level projects that can host a sub-project. */
  parents?: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [owner, setOwner] = useState<'brand' | 'client' | 'shared' | 'sub'>('brand')
  const [form, setForm] = useState({
    project_name: '',
    brand: brands[0]?.slug ?? '',
    client_id: clients[0]?.id ?? '',
    parent_project_id: parents[0]?.id ?? '',
    service_line: '',
    notes: '',
  })

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit() {
    setError('')
    if (!form.project_name) return setError('Project name is required.')
    if (owner === 'sub' && !form.parent_project_id) return setError('Choose the parent project.')
    const payload =
      owner === 'brand'
        ? { project_name: form.project_name, brand: form.brand, service_line: form.service_line, notes: form.notes }
        : owner === 'client'
        ? { project_name: form.project_name, client_id: form.client_id, service_line: form.service_line, notes: form.notes }
        : owner === 'shared'
        ? { project_name: form.project_name, shared: true, service_line: form.service_line, notes: form.notes }
        : { project_name: form.project_name, parent_project_id: form.parent_project_id, service_line: form.service_line, notes: form.notes }
    setSaving(true)
    const { ok, data } = await api<{ error?: string }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!ok) return setError(data?.error ?? 'Failed to create project.')
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        <Plus size={16} /> New project
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">New project</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Project name</label>
                <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={form.project_name} onChange={(e) => set('project_name', e.target.value)} />
              </div>

              <div className="flex gap-2 text-sm">
                <button
                  onClick={() => setOwner('brand')}
                  className={`flex-1 rounded-lg border px-3 py-1.5 ${owner === 'brand' ? 'border-ocg-navy bg-ocg-navy text-white' : 'border-gray-200 text-gray-600'}`}
                >Internal brand</button>
                <button
                  onClick={() => setOwner('client')}
                  className={`flex-1 rounded-lg border px-3 py-1.5 ${owner === 'client' ? 'border-ocg-navy bg-ocg-navy text-white' : 'border-gray-200 text-gray-600'}`}
                >External client</button>
                <button
                  onClick={() => setOwner('shared')}
                  className={`flex-1 rounded-lg border px-3 py-1.5 ${owner === 'shared' ? 'border-ocg-navy bg-ocg-navy text-white' : 'border-gray-200 text-gray-600'}`}
                >Joint / shared</button>
                {parents.length > 0 && (
                  <button
                    onClick={() => setOwner('sub')}
                    className={`flex-1 rounded-lg border px-3 py-1.5 ${owner === 'sub' ? 'border-ocg-navy bg-ocg-navy text-white' : 'border-gray-200 text-gray-600'}`}
                  >Sub-project</button>
                )}
              </div>

              {owner === 'brand' ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Brand</label>
                  <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={form.brand} onChange={(e) => set('brand', e.target.value)}>
                    {brands.map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}
                  </select>
                </div>
              ) : owner === 'client' ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Client</label>
                  <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={form.client_id} onChange={(e) => set('client_id', e.target.value)}>
                    {clients.length === 0 && <option value="">No clients yet</option>}
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              ) : owner === 'shared' ? (
                <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
                  This project will be available as shared operating work and won&apos;t be tied to a specific brand or client.
                </p>
              ) : (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Parent project</label>
                  <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={form.parent_project_id} onChange={(e) => set('parent_project_id', e.target.value)}>
                    {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <p className="mt-1 text-[11px] text-gray-400">Inherits the parent&apos;s brand. Tasks can then be created inside this sub-project.</p>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Service line</label>
                <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={form.service_line} onChange={(e) => set('service_line', e.target.value)} placeholder="e.g. Social content, Web build" />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button onClick={submit} disabled={saving} className="rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
                {saving ? 'Creating…' : 'Create project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

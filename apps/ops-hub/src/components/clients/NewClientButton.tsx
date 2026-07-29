'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { api } from '@/lib/apiClient'

export function NewClientButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ client_name: '', industry: '', country_city: '' })

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit() {
    setError('')
    if (!form.client_name) return setError('Client name is required.')
    setSaving(true)
    const { ok, data } = await api<{ error?: string }>('/api/clients', {
      method: 'POST',
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (!ok) return setError(data?.error ?? 'Failed to create client.')
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        <Plus size={16} /> New client
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">New client</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Client name</label>
                <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={form.client_name} onChange={(e) => set('client_name', e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Industry</label>
                  <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={form.industry} onChange={(e) => set('industry', e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Location</label>
                  <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={form.country_city} onChange={(e) => set('country_city', e.target.value)} placeholder="Nairobi, KE" />
                </div>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button onClick={submit} disabled={saving} className="rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
                {saving ? 'Creating…' : 'Create client'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

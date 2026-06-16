'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, UserRound } from 'lucide-react'
import { api } from '@/lib/apiClient'

type BrandOption = { id: string; label: string }

export function TeamMemberCreateForm({ brands }: { brands: BrandOption[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', email: '', role: '', brand_id: '' })

  function set(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function submit() {
    setError('')
    if (!form.name.trim()) {
      setError('Name is required.')
      return
    }
    setSaving(true)
    const { ok, data } = await api<{ error?: string }>('/api/team', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name,
        email: form.email,
        role: form.role || 'Team member',
        brand_ids: form.brand_id ? [form.brand_id] : [],
      }),
    })
    setSaving(false)
    if (!ok) {
      setError(data?.error ?? 'Failed to create team member.')
      return
    }
    setForm({ name: '', email: '', role: '', brand_id: '' })
    setOpen(false)
    router.refresh()
  }

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span>
          <span className="block text-xs font-semibold uppercase tracking-wider text-ocg-gold">Team setup</span>
          <span className="mt-1 block text-sm text-gray-500">Create team members for assignments, portals, NPT technician schedules, and class ownership.</span>
        </span>
        <span className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-3 py-2 text-sm font-medium text-white">
          <UserRound size={16} /> New
        </span>
      </button>

      {open && (
        <div className="mt-4 grid gap-3 lg:grid-cols-5">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Name</span>
            <input className="input" value={form.name} onChange={(event) => set('name', event.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Email</span>
            <input type="email" className="input" value={form.email} onChange={(event) => set('email', event.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Role</span>
            <input className="input" value={form.role} onChange={(event) => set('role', event.target.value)} placeholder="Technician, Teacher, Ops..." />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Primary brand</span>
            <select className="input" value={form.brand_id} onChange={(event) => set('brand_id', event.target.value)}>
              <option value="">All / shared</option>
              {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.label}</option>)}
            </select>
          </label>
          <div className="flex items-end">
            <button
              onClick={submit}
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              <Plus size={16} /> {saving ? 'Saving...' : 'Create'}
            </button>
          </div>
          {error && <p className="lg:col-span-5 text-sm text-red-600">{error}</p>}
        </div>
      )}
    </section>
  )
}

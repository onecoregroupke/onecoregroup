'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Save, X } from 'lucide-react'
import { api } from '@/lib/apiClient'

type BrandOption = { id: string; label: string }
type Member = {
  id: string
  name: string
  email: string | null
  role: string
  brand_ids: string[]
  active: boolean
  phone: string
  job_title: string
  department: string
  start_date: string | null
  notes: string
}

export function TeamMemberEditButton({ member, brands }: { member: Member; brands: BrandOption[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: member.name,
    email: member.email ?? '',
    role: member.role,
    phone: member.phone,
    job_title: member.job_title,
    department: member.department,
    start_date: member.start_date ?? '',
    notes: member.notes,
    brand_ids: member.brand_ids,
    active: member.active,
  })

  function set(name: keyof typeof form, value: string | boolean | string[]) {
    setForm((current) => ({ ...current, [name]: value }))
  }

  function toggleBrand(id: string) {
    set('brand_ids', form.brand_ids.includes(id) ? form.brand_ids.filter((item) => item !== id) : [...form.brand_ids, id])
  }

  async function submit() {
    setSaving(true); setError('')
    const { ok, data } = await api<{ error?: string }>('/api/team', {
      method: 'PATCH',
      body: JSON.stringify({ id: member.id, ...form, start_date: form.start_date || null }),
    })
    setSaving(false)
    if (!ok) { setError(data?.error ?? 'Failed to save.'); return }
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="Edit team member" className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:border-ocg-gold hover:text-ocg-gold">
        <Pencil size={14} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-4 flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <p className="font-semibold text-gray-900">Edit team member</p>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2">
              <Field label="Name"><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
              <Field label="Email"><input type="email" className="input" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
              <Field label="Role"><input className="input" value={form.role} onChange={(e) => set('role', e.target.value)} /></Field>
              <Field label="Phone"><input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
              <Field label="Job title"><input className="input" value={form.job_title} onChange={(e) => set('job_title', e.target.value)} /></Field>
              <Field label="Department"><input className="input" value={form.department} onChange={(e) => set('department', e.target.value)} /></Field>
              <Field label="Start date"><input type="date" className="input" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} /></Field>
              <label className="flex items-center gap-2 pt-6 text-sm text-gray-600">
                <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
                Active
              </label>
              <div className="sm:col-span-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Brands</p>
                <div className="flex flex-wrap gap-2">
                  {brands.map((brand) => (
                    <button key={brand.id} type="button" onClick={() => toggleBrand(brand.id)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${form.brand_ids.includes(brand.id) ? 'border-ocg-navy bg-ocg-navy text-white' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                      {brand.label}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Notes"><textarea className="input min-h-20" value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
              {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 p-4">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button onClick={submit} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                <Save size={15} /> {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>{children}</label>
}

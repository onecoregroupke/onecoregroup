'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { api } from '@/lib/apiClient'

type Option = { id: string; label: string }

export function DutySetupForm({ team }: { team: Option[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ assignee_id: '', title: '', description: '', department: 'Operations' })

  function set(name: keyof typeof form, value: string) {
    setForm((c) => ({ ...c, [name]: value }))
  }

  async function submit() {
    setError('')
    if (!form.title.trim()) { setError('Duty title is required.'); return }
    setSaving(true)
    const { ok, data } = await api<{ error?: string }>('/api/duties', { method: 'POST', body: JSON.stringify(form) })
    setSaving(false)
    if (!ok) { setError(data?.error ?? 'Failed to add duty.'); return }
    setForm({ assignee_id: form.assignee_id, title: '', description: '', department: form.department })
    router.refresh()
  }

  return (
    <section data-tour="duty-setup" className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 text-left">
        <span>
          <span className="block text-xs font-semibold uppercase tracking-wider text-ocg-gold">Daily duties setup</span>
          <span className="mt-1 block text-sm text-gray-500">Assign a recurring daily duty to a team member. It appears in their portal each day and rolls into the daily report.</span>
        </span>
        <span className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-3 py-2 text-sm font-medium text-white"><Plus size={16} /> New duty</span>
      </button>

      {open && (
        <div className="mt-4 grid gap-3 lg:grid-cols-5">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Assignee</span>
            <select className="input" value={form.assignee_id} onChange={(e) => set('assignee_id', e.target.value)}>
              <option value="">Unassigned</option>
              {team.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <label className="block lg:col-span-2">
            <span className="mb-1 block text-xs font-medium text-gray-500">Duty</span>
            <input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Reply to all enquiries by 10am" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Department</span>
            <input className="input" value={form.department} onChange={(e) => set('department', e.target.value)} />
          </label>
          <div className="flex items-end">
            <button onClick={submit} disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
              <Plus size={16} /> {saving ? 'Saving...' : 'Add'}
            </button>
          </div>
          <label className="block lg:col-span-5">
            <span className="mb-1 block text-xs font-medium text-gray-500">Notes (optional)</span>
            <input className="input" value={form.description} onChange={(e) => set('description', e.target.value)} />
          </label>
          {error && <p className="lg:col-span-5 text-sm text-red-600">{error}</p>}
        </div>
      )}
    </section>
  )
}

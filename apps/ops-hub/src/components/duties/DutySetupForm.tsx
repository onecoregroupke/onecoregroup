'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { api } from '@/lib/apiClient'
import { RECURRENCE_FREQUENCIES, WEEKDAY_LABELS } from '@/lib/recurrence'

type Option = { id: string; label: string }
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']

export function DutySetupForm({ team }: { team: Option[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    assignee_id: '', title: '', description: '', department: 'Operations',
    frequency: 'daily', day_of_month: '1', interval_days: '14',
    time_of_day: '', start_date: '', end_date: '', priority: 'Medium', requires_proof: false,
  })
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5])

  function set<K extends keyof typeof form>(name: K, value: (typeof form)[K]) {
    setForm((c) => ({ ...c, [name]: value }))
  }
  function toggleDay(d: number) {
    setWeekdays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => a - b)))
  }

  async function submit() {
    setError('')
    if (!form.title.trim()) { setError('Duty title is required.'); return }
    if (form.frequency === 'weekly' && weekdays.length === 0) { setError('Pick at least one weekday.'); return }
    setSaving(true)
    const payload = {
      ...form,
      weekdays: form.frequency === 'weekly' ? weekdays : [],
      day_of_month: form.frequency === 'monthly' ? form.day_of_month : '',
      interval_days: form.frequency === 'interval' ? form.interval_days : '',
    }
    const { ok, data } = await api<{ error?: string }>('/api/duties', { method: 'POST', body: JSON.stringify(payload) })
    setSaving(false)
    if (!ok) { setError(data?.error ?? 'Failed to add duty.'); return }
    setForm((c) => ({ ...c, title: '', description: '' }))
    router.refresh()
  }

  return (
    <section data-tour="duty-setup" className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 text-left">
        <span>
          <span className="block text-xs font-semibold uppercase tracking-wider text-ocg-gold">Recurring duties setup</span>
          <span className="mt-1 block text-sm text-gray-500">Assign a recurring duty with a schedule (daily, weekdays, weekly, monthly, or every N days). It appears in the assignee&apos;s portal on each due day and rolls into the report.</span>
        </span>
        <span className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-3 py-2 text-sm font-medium text-white"><Plus size={16} /> New duty</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 lg:grid-cols-4">
            <Field label="Assignee">
              <select className="input" value={form.assignee_id} onChange={(e) => set('assignee_id', e.target.value)}>
                <option value="">Unassigned</option>
                {team.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </Field>
            <Field label="Duty" className="lg:col-span-2">
              <input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Reply to all enquiries by 10am" />
            </Field>
            <Field label="Department">
              <input className="input" value={form.department} onChange={(e) => set('department', e.target.value)} />
            </Field>
          </div>

          <div className="grid gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 lg:grid-cols-4">
            <Field label="Repeats">
              <select className="input" value={form.frequency} onChange={(e) => set('frequency', e.target.value)}>
                {RECURRENCE_FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </Field>

            {form.frequency === 'weekly' && (
              <div className="lg:col-span-3">
                <span className="mb-1 block text-xs font-medium text-gray-500">On days</span>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAY_LABELS.map((label, d) => (
                    <button key={d} type="button" onClick={() => toggleDay(d)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${weekdays.includes(d) ? 'border-ocg-navy bg-ocg-navy text-white' : 'border-gray-200 bg-white text-gray-600'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {form.frequency === 'monthly' && (
              <Field label="Day of month">
                <select className="input" value={form.day_of_month} onChange={(e) => set('day_of_month', e.target.value)}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => <option key={n} value={String(n)}>{n}</option>)}
                  <option value="-1">Last working day</option>
                </select>
              </Field>
            )}
            {form.frequency === 'interval' && (
              <Field label="Every N days">
                <input type="number" min="1" className="input" value={form.interval_days} onChange={(e) => set('interval_days', e.target.value)} />
              </Field>
            )}

            <Field label="Time of day">
              <input type="time" className="input" value={form.time_of_day} onChange={(e) => set('time_of_day', e.target.value)} />
            </Field>
            <Field label="Priority">
              <select className="input" value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Starts">
              <input type="date" className="input" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
            </Field>
            <Field label="Ends (optional)">
              <input type="date" className="input" value={form.end_date} onChange={(e) => set('end_date', e.target.value)} />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-600 lg:col-span-2">
              <input type="checkbox" checked={form.requires_proof} onChange={(e) => set('requires_proof', e.target.checked)} className="h-4 w-4 accent-[#1a1a2e]" />
              Requires proof / note on completion
            </label>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <Field label="Notes (optional)">
              <input className="input" value={form.description} onChange={(e) => set('description', e.target.value)} />
            </Field>
            <div className="flex items-end">
              <button onClick={submit} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-ocg-navy px-6 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
                <Plus size={16} /> {saving ? 'Saving...' : 'Add duty'}
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </section>
  )
}

function Field({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      {children}
    </label>
  )
}

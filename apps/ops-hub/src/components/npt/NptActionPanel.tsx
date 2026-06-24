'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { api } from '@/lib/apiClient'

type Option = { id: string; label: string }
type Mode = 'customer' | 'piano' | 'job' | 'schedule' | 'complete' | 'reminder' | 'quote'

const MODE_LABEL: Record<Mode, string> = {
  customer: 'Customer',
  piano: 'Piano',
  job: 'Service job',
  schedule: 'Schedule job',
  complete: 'Complete job',
  reminder: 'Reminder',
  quote: 'Quote or invoice',
}

export function NptActionPanel({
  customers,
  pianos,
  jobs,
  team,
}: {
  customers: Option[]
  pianos: Option[]
  jobs: Option[]
  team: Option[]
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('job')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [values, setValues] = useState<Record<string, string>>({
    full_name: '',
    service_type: 'tuning',
    status: 'New enquiry',
    priority: 'Medium',
    piano_type: 'upright',
    customer_type: 'home',
    reminder_type: 'follow_up',
    record_type: 'quote',
    payment_status: 'unpaid',
  })

  function set(name: string, value: string) {
    setValues((current) => ({ ...current, [name]: value }))
  }

  async function submit() {
    setError('')
    const payload = payloadForMode(mode, values)
    if (payload.error) {
      setError(payload.error)
      return
    }
    setSaving(true)
    const { ok, data } = await api<{ error?: string }>('/api/npt', {
      method: payload.method,
      body: JSON.stringify(payload.body),
    })
    setSaving(false)
    if (!ok) {
      setError(data?.error ?? 'Failed to save NPT item.')
      return
    }
    setValues((current) => ({
      full_name: '',
      service_type: current.service_type ?? 'tuning',
      status: 'New enquiry',
      priority: current.priority ?? 'Medium',
      piano_type: current.piano_type ?? 'upright',
      customer_type: current.customer_type ?? 'home',
      reminder_type: current.reminder_type ?? 'follow_up',
      record_type: current.record_type ?? 'quote',
      payment_status: current.payment_status ?? 'unpaid',
    }))
    router.refresh()
  }

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">NPT operations</h2>
          <p className="mt-1 text-sm text-gray-500">Create service records, schedule visits, close jobs, and keep follow-up moving.</p>
        </div>
        <select className="input sm:w-52" value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
          {(Object.keys(MODE_LABEL) as Mode[]).map((key) => <option key={key} value={key}>{MODE_LABEL[key]}</option>)}
        </select>
      </div>

      {mode === 'customer' && (
        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="Full name"><input className="input" value={values.full_name ?? ''} onChange={(event) => set('full_name', event.target.value)} /></Field>
          <Field label="Phone"><input className="input" value={values.phone ?? ''} onChange={(event) => set('phone', event.target.value)} /></Field>
          <Field label="Area / estate"><input className="input" value={values.area_estate ?? ''} onChange={(event) => set('area_estate', event.target.value)} /></Field>
          <Field label="Next follow-up"><input type="date" className="input" value={values.next_follow_up_date ?? ''} onChange={(event) => set('next_follow_up_date', event.target.value)} /></Field>
        </div>
      )}

      {mode === 'piano' && (
        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="Customer"><Select options={customers} value={values.customer_id ?? ''} onChange={(value) => set('customer_id', value)} empty="Unlinked" /></Field>
          <Field label="Make"><input className="input" value={values.make ?? ''} onChange={(event) => set('make', event.target.value)} /></Field>
          <Field label="Type"><input className="input" value={values.piano_type ?? ''} onChange={(event) => set('piano_type', event.target.value)} /></Field>
          <Field label="Next service"><input type="date" className="input" value={values.recommended_next_service_date ?? ''} onChange={(event) => set('recommended_next_service_date', event.target.value)} /></Field>
          <Field label="Condition"><input className="input" value={values.condition ?? ''} onChange={(event) => set('condition', event.target.value)} /></Field>
          <Field label="Location"><input className="input" value={values.location ?? ''} onChange={(event) => set('location', event.target.value)} /></Field>
        </div>
      )}

      {mode === 'job' && (
        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="Customer"><Select options={customers} value={values.customer_id ?? ''} onChange={(value) => set('customer_id', value)} empty="Unlinked" /></Field>
          <Field label="Piano"><Select options={pianos} value={values.piano_id ?? ''} onChange={(value) => set('piano_id', value)} empty="Unlinked" /></Field>
          <Field label="Technician"><Select options={team} value={values.technician_id ?? ''} onChange={(value) => set('technician_id', value)} empty="Unassigned" /></Field>
          <Field label="Scheduled"><input type="datetime-local" className="input" value={values.scheduled_at ?? ''} onChange={(event) => set('scheduled_at', event.target.value)} /></Field>
          <Field label="Service type"><input className="input" value={values.service_type ?? ''} onChange={(event) => set('service_type', event.target.value)} /></Field>
          <Field label="Status"><input className="input" value={values.status ?? ''} onChange={(event) => set('status', event.target.value)} /></Field>
          <Field label="Estimate"><input type="number" className="input" value={values.estimated_cost_ksh ?? ''} onChange={(event) => set('estimated_cost_ksh', event.target.value)} /></Field>
          <Field label="Location"><input className="input" value={values.location ?? ''} onChange={(event) => set('location', event.target.value)} /></Field>
        </div>
      )}

      {mode === 'schedule' && (
        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="Job"><Select options={jobs} value={values.id ?? ''} onChange={(value) => set('id', value)} empty="Select job" /></Field>
          <Field label="Technician"><Select options={team} value={values.technician_id ?? ''} onChange={(value) => set('technician_id', value)} empty="Unassigned" /></Field>
          <Field label="Scheduled"><input type="datetime-local" className="input" value={values.scheduled_at ?? ''} onChange={(event) => set('scheduled_at', event.target.value)} /></Field>
          <Field label="Status"><input className="input" value={values.status ?? 'Scheduled'} onChange={(event) => set('status', event.target.value)} /></Field>
        </div>
      )}

      {mode === 'complete' && (
        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="Job"><Select options={jobs} value={values.id ?? ''} onChange={(value) => set('id', value)} empty="Select job" /></Field>
          <Field label="Technician"><Select options={team} value={values.technician_id ?? ''} onChange={(value) => set('technician_id', value)} empty="Use current" /></Field>
          <Field label="Final cost"><input type="number" className="input" value={values.final_cost_ksh ?? ''} onChange={(event) => set('final_cost_ksh', event.target.value)} /></Field>
          <Field label="Next service"><input type="date" className="input" value={values.next_service_date ?? ''} onChange={(event) => set('next_service_date', event.target.value)} /></Field>
        </div>
      )}

      {mode === 'reminder' && (
        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="Title"><input className="input" value={values.title ?? ''} onChange={(event) => set('title', event.target.value)} /></Field>
          <Field label="Customer"><Select options={customers} value={values.customer_id ?? ''} onChange={(value) => set('customer_id', value)} empty="Unlinked" /></Field>
          <Field label="Due"><input type="datetime-local" className="input" value={values.due_at ?? ''} onChange={(event) => set('due_at', event.target.value)} /></Field>
          <Field label="Channel"><input className="input" value={values.channel ?? ''} onChange={(event) => set('channel', event.target.value)} /></Field>
        </div>
      )}

      {mode === 'quote' && (
        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="Customer"><Select options={customers} value={values.customer_id ?? ''} onChange={(value) => set('customer_id', value)} empty="Unlinked" /></Field>
          <Field label="Job"><Select options={jobs} value={values.service_job_id ?? ''} onChange={(value) => set('service_job_id', value)} empty="Unlinked" /></Field>
          <Field label="Type"><select className="input" value={values.record_type ?? 'quote'} onChange={(event) => set('record_type', event.target.value)}><option value="quote">Quote</option><option value="invoice">Invoice</option></select></Field>
          <Field label="Amount"><input type="number" className="input" value={values.amount ?? ''} onChange={(event) => set('amount', event.target.value)} /></Field>
        </div>
      )}

      {['job', 'complete'].includes(mode) && (
        <Field label={mode === 'complete' ? 'Completion summary' : 'Job notes'}>
          <textarea className="input mt-3 min-h-[76px]" value={values[mode === 'complete' ? 'completion_summary' : 'job_notes'] ?? ''} onChange={(event) => set(mode === 'complete' ? 'completion_summary' : 'job_notes', event.target.value)} />
        </Field>
      )}

      {mode === 'complete' && (
        <Field label="Recommendations">
          <textarea className="input mt-3 min-h-[60px]" value={values.recommendations ?? ''} onChange={(event) => set('recommendations', event.target.value)} />
        </Field>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end">
        <button onClick={submit} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
          <Plus size={16} /> {saving ? 'Saving...' : `Save ${MODE_LABEL[mode].toLowerCase()}`}
        </button>
      </div>
    </section>
  )
}

function payloadForMode(mode: Mode, values: Record<string, string>) {
  if (mode === 'customer') {
    if (!values.full_name?.trim()) return { error: 'Customer name is required.' }
    return { method: 'POST', body: { type: 'npt_customer', values } }
  }
  if (mode === 'piano') return { method: 'POST', body: { type: 'npt_piano', values } }
  if (mode === 'job') return { method: 'POST', body: { type: 'npt_job', values } }
  if (mode === 'reminder') {
    if (!values.title?.trim()) return { error: 'Reminder title is required.' }
    return { method: 'POST', body: { type: 'npt_reminder', values } }
  }
  if (mode === 'quote') {
    const amountKey = values.record_type === 'invoice' ? 'invoice_amount_ksh' : 'quote_amount_ksh'
    return { method: 'POST', body: { type: 'npt_quote', values: { ...values, [amountKey]: values.amount } } }
  }
  if (mode === 'schedule') {
    if (!values.id) return { error: 'Select a job to schedule.' }
    return { method: 'PATCH', body: { type: 'npt_job', id: values.id, values: { scheduled_at: values.scheduled_at, technician_id: values.technician_id, status: values.status || 'Scheduled' } } }
  }
  if (!values.id) return { error: 'Select a job to complete.' }
  return { method: 'PATCH', body: { action: 'complete-job', id: values.id, values } }
}

function Select({ options, value, onChange, empty }: { options: Option[]; value: string; onChange: (value: string) => void; empty: string }) {
  return (
    <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{empty}</option>
      {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      {children}
    </label>
  )
}

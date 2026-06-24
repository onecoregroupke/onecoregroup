'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { api } from '@/lib/apiClient'

export function RhythmsActionPanel() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [values, setValues] = useState<Record<string, string>>({
    full_name: '',
    programme: '',
    cohort: '',
    enrollment_status: 'enquiry',
  })

  function set(name: string, value: string) {
    setValues((current) => ({ ...current, [name]: value }))
  }

  async function submit() {
    setError('')
    if (!values.full_name?.trim()) {
      setError('Student name is required.')
      return
    }
    setSaving(true)
    const { ok, data } = await api<{ error?: string }>('/api/rhythms', {
      method: 'POST',
      body: JSON.stringify({ type: 'rhythms_student', values }),
    })
    setSaving(false)
    if (!ok) {
      setError(data?.error ?? 'Failed to create student.')
      return
    }
    setValues({
      full_name: '',
      programme: values.programme ?? '',
      cohort: values.cohort ?? '',
      enrollment_status: values.enrollment_status ?? 'enquiry',
    })
    router.refresh()
  }

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Create Rhythms student</h2>
        <p className="mt-1 text-sm text-gray-500">Use this for admissions, enrollment tracking, and SchoolPay reconciliation matching.</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-4">
        <Field label="Full name"><input className="input" value={values.full_name ?? ''} onChange={(event) => set('full_name', event.target.value)} /></Field>
        <Field label="Programme"><input className="input" value={values.programme ?? ''} onChange={(event) => set('programme', event.target.value)} /></Field>
        <Field label="Cohort"><input className="input" value={values.cohort ?? ''} onChange={(event) => set('cohort', event.target.value)} /></Field>
        <Field label="Status"><input className="input" value={values.enrollment_status ?? ''} onChange={(event) => set('enrollment_status', event.target.value)} /></Field>
        <Field label="Admission no."><input className="input" value={values.admission_number ?? ''} onChange={(event) => set('admission_number', event.target.value)} /></Field>
        <Field label="SchoolPay code"><input className="input" value={values.schoolpay_code ?? ''} onChange={(event) => set('schoolpay_code', event.target.value)} /></Field>
        <Field label="Phone"><input className="input" value={values.phone ?? ''} onChange={(event) => set('phone', event.target.value)} /></Field>
        <Field label="Email"><input className="input" value={values.email ?? ''} onChange={(event) => set('email', event.target.value)} /></Field>
      </div>
      <Field label="Notes">
        <textarea className="input mt-3 min-h-[64px]" value={values.notes ?? ''} onChange={(event) => set('notes', event.target.value)} />
      </Field>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end">
        <button onClick={submit} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
          <Plus size={16} /> {saving ? 'Saving...' : 'Create student'}
        </button>
      </div>
    </section>
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

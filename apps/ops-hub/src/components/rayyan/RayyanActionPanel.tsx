'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { api } from '@/lib/apiClient'

type Option = { id: string; label: string }
type Mode = 'guardian' | 'student' | 'admission' | 'class' | 'admin_task' | 'fee_followup'

const MODE_LABEL: Record<Mode, string> = {
  guardian: 'Parent / guardian',
  student: 'Student',
  admission: 'Admission',
  class: 'Class',
  admin_task: 'Admin task',
  fee_followup: 'Fee follow-up',
}

export function RayyanActionPanel({
  guardians,
  students,
  team,
}: {
  guardians: Option[]
  students: Option[]
  team: Option[]
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('student')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [values, setValues] = useState<Record<string, string>>({
    full_name: '',
    relationship_to_child: 'Parent',
    enrollment_status: 'enquiry',
    pipeline_status: 'New enquiry',
    documents_status: 'pending',
    schoolpay_status: 'unknown',
    status: 'pending',
    priority: 'Medium',
    follow_up_status: 'pending',
    task_type: 'admin',
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
    const { ok, data } = await api<{ error?: string }>('/api/rayyan', {
      method: 'POST',
      body: JSON.stringify(payload.body),
    })
    setSaving(false)
    if (!ok) {
      setError(data?.error ?? 'Failed to save Rayyan item.')
      return
    }
    setValues((current) => ({
      full_name: '',
      relationship_to_child: current.relationship_to_child ?? 'Parent',
      enrollment_status: current.enrollment_status ?? 'enquiry',
      pipeline_status: current.pipeline_status ?? 'New enquiry',
      documents_status: current.documents_status ?? 'pending',
      schoolpay_status: current.schoolpay_status ?? 'unknown',
      status: current.status ?? 'pending',
      priority: current.priority ?? 'Medium',
      follow_up_status: current.follow_up_status ?? 'pending',
      task_type: current.task_type ?? 'admin',
    }))
    router.refresh()
  }

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Rayyan admin actions</h2>
          <p className="mt-1 text-sm text-gray-500">Track admissions, parents, fee follow-ups, classes, and admin ownership around SchoolPay.</p>
        </div>
        <select className="input sm:w-52" value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
          {(Object.keys(MODE_LABEL) as Mode[]).map((key) => <option key={key} value={key}>{MODE_LABEL[key]}</option>)}
        </select>
      </div>

      {mode === 'guardian' && (
        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="Full name"><input className="input" value={values.full_name ?? ''} onChange={(event) => set('full_name', event.target.value)} /></Field>
          <Field label="Phone"><input className="input" value={values.phone ?? ''} onChange={(event) => set('phone', event.target.value)} /></Field>
          <Field label="Email"><input className="input" value={values.email ?? ''} onChange={(event) => set('email', event.target.value)} /></Field>
          <Field label="Relationship"><input className="input" value={values.relationship_to_child ?? ''} onChange={(event) => set('relationship_to_child', event.target.value)} /></Field>
        </div>
      )}

      {mode === 'student' && (
        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="Full name"><input className="input" value={values.full_name ?? ''} onChange={(event) => set('full_name', event.target.value)} /></Field>
          <Field label="Guardian"><Select options={guardians} value={values.guardian_id ?? ''} onChange={(value) => set('guardian_id', value)} empty="Unlinked" /></Field>
          <Field label="Class level"><input className="input" value={values.class_level ?? ''} onChange={(event) => set('class_level', event.target.value)} /></Field>
          <Field label="Status"><input className="input" value={values.enrollment_status ?? ''} onChange={(event) => set('enrollment_status', event.target.value)} /></Field>
          <Field label="Admission no."><input className="input" value={values.admission_number ?? ''} onChange={(event) => set('admission_number', event.target.value)} /></Field>
          <Field label="SchoolPay code"><input className="input" value={values.schoolpay_code ?? ''} onChange={(event) => set('schoolpay_code', event.target.value)} /></Field>
          <Field label="Start date"><input type="date" className="input" value={values.start_date ?? ''} onChange={(event) => set('start_date', event.target.value)} /></Field>
        </div>
      )}

      {mode === 'admission' && (
        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="Student"><Select options={students} value={values.student_id ?? ''} onChange={(value) => set('student_id', value)} empty="Unlinked enquiry" /></Field>
          <Field label="Guardian"><Select options={guardians} value={values.guardian_id ?? ''} onChange={(value) => set('guardian_id', value)} empty="Unlinked" /></Field>
          <Field label="Pipeline status"><input className="input" value={values.pipeline_status ?? ''} onChange={(event) => set('pipeline_status', event.target.value)} /></Field>
          <Field label="Next follow-up"><input type="date" className="input" value={values.next_follow_up_date ?? ''} onChange={(event) => set('next_follow_up_date', event.target.value)} /></Field>
          <Field label="Source"><input className="input" value={values.source ?? ''} onChange={(event) => set('source', event.target.value)} /></Field>
          <Field label="Documents"><input className="input" value={values.documents_status ?? ''} onChange={(event) => set('documents_status', event.target.value)} /></Field>
          <Field label="SchoolPay status"><input className="input" value={values.schoolpay_status ?? ''} onChange={(event) => set('schoolpay_status', event.target.value)} /></Field>
        </div>
      )}

      {mode === 'class' && (
        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="Name"><input className="input" value={values.name ?? ''} onChange={(event) => set('name', event.target.value)} /></Field>
          <Field label="Level"><input className="input" value={values.level ?? ''} onChange={(event) => set('level', event.target.value)} /></Field>
          <Field label="Teacher"><Select options={team} value={values.teacher_id ?? ''} onChange={(value) => set('teacher_id', value)} empty="Unassigned" /></Field>
        </div>
      )}

      {mode === 'admin_task' && (
        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="Title"><input className="input" value={values.title ?? ''} onChange={(event) => set('title', event.target.value)} /></Field>
          <Field label="Student"><Select options={students} value={values.student_id ?? ''} onChange={(value) => set('student_id', value)} empty="No student" /></Field>
          <Field label="Due date"><input type="date" className="input" value={values.due_date ?? ''} onChange={(event) => set('due_date', event.target.value)} /></Field>
          <Field label="Priority"><input className="input" value={values.priority ?? ''} onChange={(event) => set('priority', event.target.value)} /></Field>
        </div>
      )}

      {mode === 'fee_followup' && (
        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="Student"><Select options={students} value={values.student_id ?? ''} onChange={(value) => set('student_id', value)} empty="No student" /></Field>
          <Field label="SchoolPay code"><input className="input" value={values.schoolpay_code ?? ''} onChange={(event) => set('schoolpay_code', event.target.value)} /></Field>
          <Field label="Fee item"><input className="input" value={values.expected_fee_item ?? ''} onChange={(event) => set('expected_fee_item', event.target.value)} /></Field>
          <Field label="Next follow-up"><input type="date" className="input" value={values.next_follow_up_date ?? ''} onChange={(event) => set('next_follow_up_date', event.target.value)} /></Field>
          <Field label="Last known status"><input className="input" value={values.last_known_fee_status ?? ''} onChange={(event) => set('last_known_fee_status', event.target.value)} /></Field>
        </div>
      )}

      {!['guardian', 'student'].includes(mode) && (
        <Field label="Notes">
          <textarea className="input mt-3 min-h-[76px]" value={values.notes ?? ''} onChange={(event) => set('notes', event.target.value)} />
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
  if (mode === 'guardian') {
    if (!values.full_name?.trim()) return { error: 'Guardian name is required.' }
    return { body: { type: 'rayyan_guardian', values } }
  }
  if (mode === 'student') {
    if (!values.full_name?.trim()) return { error: 'Student name is required.' }
    return { body: { type: 'rayyan_student', values } }
  }
  if (mode === 'admission') return { body: { type: 'rayyan_admission', values } }
  if (mode === 'class') {
    if (!values.name?.trim()) return { error: 'Class name is required.' }
    return { body: { type: 'rayyan_class', values } }
  }
  if (mode === 'admin_task') {
    if (!values.title?.trim()) return { error: 'Task title is required.' }
    return { body: { type: 'rayyan_admin_task', values } }
  }
  return { body: { type: 'rayyan_fee_followup', values } }
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

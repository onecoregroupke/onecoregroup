'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { api } from '@/lib/apiClient'

type Option = { id: string; label: string }
type Mode = 'student' | 'guardian' | 'admission' | 'class' | 'fee_followup' | 'admin_task'

const MODE_LABEL: Record<Mode, string> = {
  student: 'Student',
  guardian: 'Parent / guardian',
  admission: 'Admission',
  class: 'Class',
  fee_followup: 'Fee follow-up',
  admin_task: 'Admin task',
}

const MODE_TYPE: Record<Mode, string> = {
  student: 'rhythms_student',
  guardian: 'rhythms_guardian',
  admission: 'rhythms_admission',
  class: 'rhythms_class',
  fee_followup: 'rhythms_fee_followup',
  admin_task: 'rhythms_admin_task',
}

export function RhythmsActionPanel({
  guardians = [],
  students = [],
  classes = [],
  team = [],
}: {
  guardians?: Option[]
  students?: Option[]
  classes?: Option[]
  team?: Option[]
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('student')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [values, setValues] = useState<Record<string, string>>({
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

  function requiredFor(m: Mode): string | null {
    if (m === 'student' || m === 'guardian') return values.full_name?.trim() ? null : 'Name is required.'
    if (m === 'class') return values.name?.trim() ? null : 'Class name is required.'
    if (m === 'admin_task') return values.title?.trim() ? null : 'Task title is required.'
    return null
  }

  async function submit() {
    setError('')
    const problem = requiredFor(mode)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    const { ok, data } = await api<{ error?: string }>('/api/rhythms', {
      method: 'POST',
      body: JSON.stringify({ type: MODE_TYPE[mode], values }),
    })
    setSaving(false)
    if (!ok) {
      setError(data?.error ?? 'Failed to save.')
      return
    }
    setValues((current) => ({
      relationship_to_child: current.relationship_to_child ?? 'Parent',
      enrollment_status: current.enrollment_status ?? 'enquiry',
      pipeline_status: current.pipeline_status ?? 'New enquiry',
      documents_status: current.documents_status ?? 'pending',
      schoolpay_status: current.schoolpay_status ?? 'unknown',
      status: current.status ?? 'pending',
      priority: current.priority ?? 'Medium',
      follow_up_status: current.follow_up_status ?? 'pending',
      task_type: current.task_type ?? 'admin',
      programme: current.programme ?? '',
      cohort: current.cohort ?? '',
    }))
    router.refresh()
  }

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Rhythms admin actions</h2>
          <p className="mt-1 text-sm text-gray-500">Students, parents, admissions, classes, and fee follow-ups around SchoolPay.</p>
        </div>
        <select className="input sm:w-52" value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
          {(Object.keys(MODE_LABEL) as Mode[]).map((key) => <option key={key} value={key}>{MODE_LABEL[key]}</option>)}
        </select>
      </div>

      {mode === 'student' && (
        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="Full name"><input className="input" value={values.full_name ?? ''} onChange={(e) => set('full_name', e.target.value)} /></Field>
          <Field label="Guardian"><Select options={guardians} value={values.guardian_id ?? ''} onChange={(v) => set('guardian_id', v)} empty="Unlinked" /></Field>
          <Field label="Class"><Select options={classes} value={values.class_id ?? ''} onChange={(v) => set('class_id', v)} empty="Unassigned" /></Field>
          <Field label="Programme"><input className="input" value={values.programme ?? ''} onChange={(e) => set('programme', e.target.value)} /></Field>
          <Field label="Cohort"><input className="input" value={values.cohort ?? ''} onChange={(e) => set('cohort', e.target.value)} /></Field>
          <Field label="Status"><input className="input" value={values.enrollment_status ?? ''} onChange={(e) => set('enrollment_status', e.target.value)} /></Field>
          <Field label="Admission no."><input className="input" value={values.admission_number ?? ''} onChange={(e) => set('admission_number', e.target.value)} /></Field>
          <Field label="SchoolPay code"><input className="input" value={values.schoolpay_code ?? ''} onChange={(e) => set('schoolpay_code', e.target.value)} /></Field>
          <Field label="Phone"><input className="input" value={values.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Email"><input className="input" value={values.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
        </div>
      )}

      {mode === 'guardian' && (
        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="Full name"><input className="input" value={values.full_name ?? ''} onChange={(e) => set('full_name', e.target.value)} /></Field>
          <Field label="Phone"><input className="input" value={values.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Email"><input className="input" value={values.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Relationship"><input className="input" value={values.relationship_to_child ?? ''} onChange={(e) => set('relationship_to_child', e.target.value)} /></Field>
        </div>
      )}

      {mode === 'admission' && (
        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="Student"><Select options={students} value={values.student_id ?? ''} onChange={(v) => set('student_id', v)} empty="Unlinked enquiry" /></Field>
          <Field label="Guardian"><Select options={guardians} value={values.guardian_id ?? ''} onChange={(v) => set('guardian_id', v)} empty="Unlinked" /></Field>
          <Field label="Pipeline status"><input className="input" value={values.pipeline_status ?? ''} onChange={(e) => set('pipeline_status', e.target.value)} /></Field>
          <Field label="Next follow-up"><input type="date" className="input" value={values.next_follow_up_date ?? ''} onChange={(e) => set('next_follow_up_date', e.target.value)} /></Field>
          <Field label="Source"><input className="input" value={values.source ?? ''} onChange={(e) => set('source', e.target.value)} /></Field>
          <Field label="Documents"><input className="input" value={values.documents_status ?? ''} onChange={(e) => set('documents_status', e.target.value)} /></Field>
          <Field label="SchoolPay status"><input className="input" value={values.schoolpay_status ?? ''} onChange={(e) => set('schoolpay_status', e.target.value)} /></Field>
        </div>
      )}

      {mode === 'class' && (
        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="Name"><input className="input" value={values.name ?? ''} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Level"><input className="input" value={values.level ?? ''} onChange={(e) => set('level', e.target.value)} /></Field>
          <Field label="Teacher"><Select options={team} value={values.teacher_id ?? ''} onChange={(v) => set('teacher_id', v)} empty="Unassigned" /></Field>
        </div>
      )}

      {mode === 'fee_followup' && (
        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="Student"><Select options={students} value={values.student_id ?? ''} onChange={(v) => set('student_id', v)} empty="No student" /></Field>
          <Field label="SchoolPay code"><input className="input" value={values.schoolpay_code ?? ''} onChange={(e) => set('schoolpay_code', e.target.value)} /></Field>
          <Field label="Fee item"><input className="input" value={values.expected_fee_item ?? ''} onChange={(e) => set('expected_fee_item', e.target.value)} /></Field>
          <Field label="Next follow-up"><input type="date" className="input" value={values.next_follow_up_date ?? ''} onChange={(e) => set('next_follow_up_date', e.target.value)} /></Field>
          <Field label="Last known status"><input className="input" value={values.last_known_fee_status ?? ''} onChange={(e) => set('last_known_fee_status', e.target.value)} /></Field>
        </div>
      )}

      {mode === 'admin_task' && (
        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="Title"><input className="input" value={values.title ?? ''} onChange={(e) => set('title', e.target.value)} /></Field>
          <Field label="Student"><Select options={students} value={values.student_id ?? ''} onChange={(v) => set('student_id', v)} empty="No student" /></Field>
          <Field label="Due date"><input type="date" className="input" value={values.due_date ?? ''} onChange={(e) => set('due_date', e.target.value)} /></Field>
          <Field label="Priority"><input className="input" value={values.priority ?? ''} onChange={(e) => set('priority', e.target.value)} /></Field>
        </div>
      )}

      {mode !== 'guardian' && (
        <Field label="Notes">
          <textarea className="input mt-3 min-h-[64px]" value={values.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
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

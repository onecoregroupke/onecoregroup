'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Award, BookOpenCheck, CheckCircle2, History, Medal } from 'lucide-react'
import { api } from '@/lib/apiClient'

type Option = { id: string; label: string }
type Mode = 'activity' | 'assessment' | 'history'

const LEARNING_AREAS = [
  'Language Activities', 'Mathematical Activities', 'Environmental Activities',
  'Psychomotor & Creative Activities', 'Religious Education Activities',
  'Pre-Braille Activities', 'Other',
]
const PERFORMANCE_LEVELS = [
  'Exceeding Expectation', 'Meeting Expectation', 'Approaching Expectation', 'Below Expectation',
]
const HISTORY_TYPES = ['note', 'enrollment', 'promotion', 'transfer', 'award', 'discipline', 'exit']

/**
 * Per-student academic capture: enrol in a co-curricular activity, record a
 * CBC assessment (feeds the transcript), or add a history/timeline event.
 */
export function StudentAcademicActions({ studentId, activities }: {
  studentId: string
  activities: Option[]
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('assessment')
  const [values, setValues] = useState<Record<string, string>>({})
  const [newActivityName, setNewActivityName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  function set(name: string, value: string) {
    setValues((c) => ({ ...c, [name]: value }))
  }
  function switchMode(m: Mode) {
    setMode(m); setError(''); setSuccess('')
  }

  async function submit() {
    setError(''); setSuccess(''); setSaving(true)
    try {
      let payload: { type: string; values: Record<string, unknown> }
      if (mode === 'activity') {
        let activityId = values.activity_id
        // "New activity" path: register the activity first, then enrol.
        if (!activityId && newActivityName.trim()) {
          const { ok, data } = await api<{ row?: { id: string }; error?: string }>('/api/rayyan', {
            method: 'POST',
            body: JSON.stringify({ type: 'rayyan_activity', values: { name: newActivityName.trim() } }),
          })
          if (!ok || !data.row) throw new Error(data?.error ?? 'Could not create the activity.')
          activityId = data.row.id
        }
        if (!activityId) throw new Error('Choose an activity or type a new one.')
        payload = {
          type: 'rayyan_student_activity',
          values: { student_id: studentId, activity_id: activityId, joined_on: values.joined_on, notes: values.notes },
        }
      } else if (mode === 'assessment') {
        payload = {
          type: 'rayyan_assessment',
          values: {
            student_id: studentId,
            academic_year: values.academic_year || String(new Date().getFullYear()),
            term: values.term || 'Term 1',
            learning_area: values.learning_area === 'Other' ? values.learning_area_other || 'Other' : values.learning_area,
            assessment_type: values.assessment_type || 'End of term',
            performance_level: values.performance_level,
            score: values.score,
            remarks: values.remarks,
            assessed_on: values.assessed_on,
            teacher: values.teacher,
          },
        }
      } else {
        payload = {
          type: 'rayyan_history',
          values: {
            student_id: studentId,
            event_type: values.event_type || 'note',
            title: values.title,
            details: values.details,
            occurred_on: values.occurred_on,
          },
        }
      }
      const { ok, data } = await api<{ error?: string }>('/api/rayyan', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      if (!ok) throw new Error(data?.error ?? 'Failed to save.')
      setSuccess('Saved.')
      setValues({})
      setNewActivityName('')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const tabs: { key: Mode; label: string; icon: React.ElementType }[] = [
    { key: 'assessment', label: 'Assessment', icon: BookOpenCheck },
    { key: 'activity', label: 'Co-curricular', icon: Medal },
    { key: 'history', label: 'History event', icon: History },
  ]

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ocg-gold"><Award size={13} /> Academic records</h2>
          <p className="mt-1 text-sm text-gray-500">Record assessments, co-curricular enrolments, and student history.</p>
        </div>
        <div className="flex rounded-lg border border-gray-200 p-1">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => switchMode(key)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold ${mode === key ? 'bg-ocg-navy text-white' : 'text-gray-500 hover:text-gray-800'}`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'assessment' && (
        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="Academic year"><input className="input" placeholder={String(new Date().getFullYear())} value={values.academic_year ?? ''} onChange={(e) => set('academic_year', e.target.value)} /></Field>
          <Field label="Term">
            <select className="input" value={values.term ?? 'Term 1'} onChange={(e) => set('term', e.target.value)}>
              {['Term 1', 'Term 2', 'Term 3'].map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Learning area *">
            <select className="input" value={values.learning_area ?? ''} onChange={(e) => set('learning_area', e.target.value)}>
              <option value="">Choose…</option>
              {LEARNING_AREAS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </Field>
          {values.learning_area === 'Other' && (
            <Field label="Specify area"><input className="input" value={values.learning_area_other ?? ''} onChange={(e) => set('learning_area_other', e.target.value)} /></Field>
          )}
          <Field label="Performance level">
            <select className="input" value={values.performance_level ?? ''} onChange={(e) => set('performance_level', e.target.value)}>
              <option value="">Choose…</option>
              {PERFORMANCE_LEVELS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Score (optional)"><input type="number" step="0.01" className="input" value={values.score ?? ''} onChange={(e) => set('score', e.target.value)} /></Field>
          <Field label="Assessed on"><input type="date" className="input" value={values.assessed_on ?? ''} onChange={(e) => set('assessed_on', e.target.value)} /></Field>
          <Field label="Teacher"><input className="input" value={values.teacher ?? ''} onChange={(e) => set('teacher', e.target.value)} /></Field>
          <Field label="Remarks" className="lg:col-span-4"><input className="input" value={values.remarks ?? ''} onChange={(e) => set('remarks', e.target.value)} /></Field>
        </div>
      )}

      {mode === 'activity' && (
        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="Activity">
            <select className="input" value={values.activity_id ?? ''} onChange={(e) => set('activity_id', e.target.value)}>
              <option value="">Choose…</option>
              {activities.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </Field>
          <Field label="…or add a new activity"><input className="input" placeholder="e.g. Swimming" value={newActivityName} onChange={(e) => setNewActivityName(e.target.value)} /></Field>
          <Field label="Joined on"><input type="date" className="input" value={values.joined_on ?? ''} onChange={(e) => set('joined_on', e.target.value)} /></Field>
          <Field label="Notes"><input className="input" value={values.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
        </div>
      )}

      {mode === 'history' && (
        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="Event type">
            <select className="input" value={values.event_type ?? 'note'} onChange={(e) => set('event_type', e.target.value)}>
              {HISTORY_TYPES.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
            </select>
          </Field>
          <Field label="Title *"><input className="input" placeholder="e.g. Promoted to PP2" value={values.title ?? ''} onChange={(e) => set('title', e.target.value)} /></Field>
          <Field label="Date"><input type="date" className="input" value={values.occurred_on ?? ''} onChange={(e) => set('occurred_on', e.target.value)} /></Field>
          <Field label="Details" className="lg:col-span-4"><input className="input" value={values.details ?? ''} onChange={(e) => set('details', e.target.value)} /></Field>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 size={15} /> {success}</p>}
      <div className="mt-4 flex justify-end">
        <button onClick={submit} disabled={saving}
          className="rounded-lg bg-ocg-navy px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
          {saving ? 'Saving…' : 'Save record'}
        </button>
      </div>
    </section>
  )
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      {children}
    </label>
  )
}

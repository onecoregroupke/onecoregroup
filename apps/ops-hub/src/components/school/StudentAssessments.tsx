'use client'

import { useEffect, useMemo, useState } from 'react'
import { GraduationCap, Plus, Trash2 } from 'lucide-react'
import { api } from '@/lib/apiClient'
import type { SchoolAssessmentRow } from '@ocg/db'

type School = 'rayyan' | 'rhythms' | 'darul'

const STATUSES = ['recorded', 'missed', 'deferred', 'repeated'] as const
const TYPES = ['exam', 'cat', 'assignment', 'practical'] as const
const today = () => new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)

/**
 * Marks-based academic record for a school student (Rhythms courses / Darul
 * hifz+subjects). Record a mark (score out of max, or a status like missed /
 * deferred / repeated), grouped by year + term. Kept entirely separate from the
 * fee ledger — this is academic, not financial. Explicit post, never autosaved.
 */
export function StudentAssessments({ school, studentId, admissionNo = '', canEdit, subjectLabel = 'Subject / learning area' }: {
  school: School
  studentId: string
  admissionNo?: string
  canEdit: boolean
  subjectLabel?: string
}) {
  const [rows, setRows] = useState<SchoolAssessmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    subject: '', academic_year: '', term: '', assessment_type: 'exam',
    score: '', max_score: '100', grade: '', status: 'recorded', teacher: '', remarks: '', assessed_on: today(),
  })

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  async function load() {
    setLoading(true); setError('')
    const { ok, data } = await api<{ assessments: SchoolAssessmentRow[]; error?: string }>(`/api/school-assessments?school=${school}&studentId=${studentId}`)
    if (!ok) { setError(data?.error ?? 'Could not load the academic record.'); setLoading(false); return }
    setRows(data.assessments ?? [])
    setLoading(false)
  }
  useEffect(() => { void load() }, [school, studentId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function record() {
    if (!form.subject.trim()) { setError('Enter a subject / learning area.'); return }
    setBusy(true); setError('')
    const { ok, data } = await api<{ error?: string }>('/api/school-assessments', {
      method: 'POST',
      body: JSON.stringify({ values: { school, student_id: studentId, student_admission_no: admissionNo, ...form } }),
    })
    setBusy(false)
    if (!ok) { setError(data?.error ?? 'Failed to record the mark.'); return }
    setForm((f) => ({ ...f, subject: '', score: '', grade: '', remarks: '' }))
    setShowForm(false)
    void load()
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this assessment? This cannot be undone.')) return
    setBusy(true); setError('')
    const { ok, data } = await api<{ error?: string }>(`/api/school-assessments?school=${school}&id=${id}`, { method: 'DELETE' })
    setBusy(false)
    if (!ok) { setError(data?.error ?? 'Failed to delete.'); return }
    void load()
  }

  // Group by academic year + term, newest first.
  const groups = useMemo(() => {
    const m = new Map<string, SchoolAssessmentRow[]>()
    for (const r of rows) {
      const key = `${r.academic_year || '—'} · ${r.term || '—'}`
      m.set(key, [...(m.get(key) ?? []), r])
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [rows])

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ocg-gold">
          <GraduationCap size={14} /> Academic record
        </h2>
        {canEdit && (
          <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-ocg-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800">
            <Plus size={13} /> Record mark
          </button>
        )}
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {canEdit && showForm && (
        <div className="mb-4 grid gap-3 rounded-lg border border-gray-100 bg-gray-50 p-4 lg:grid-cols-4">
          <Field label={subjectLabel}><input className="input" value={form.subject} onChange={(e) => set('subject', e.target.value)} placeholder="e.g. Piano Grade 3" /></Field>
          <Field label="Academic year"><input className="input" value={form.academic_year} onChange={(e) => set('academic_year', e.target.value)} placeholder="2026" /></Field>
          <Field label="Term"><input className="input" value={form.term} onChange={(e) => set('term', e.target.value)} placeholder="Term 1" /></Field>
          <Field label="Type">
            <select className="input" value={form.assessment_type} onChange={(e) => set('assessment_type', e.target.value)}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Score"><input type="number" className="input" value={form.score} onChange={(e) => set('score', e.target.value)} placeholder="—" /></Field>
          <Field label="Out of"><input type="number" className="input" value={form.max_score} onChange={(e) => set('max_score', e.target.value)} /></Field>
          <Field label="Grade"><input className="input" value={form.grade} onChange={(e) => set('grade', e.target.value)} placeholder="A / Distinction" /></Field>
          <Field label="Status">
            <select className="input" value={form.status} onChange={(e) => set('status', e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Teacher / examiner"><input className="input" value={form.teacher} onChange={(e) => set('teacher', e.target.value)} /></Field>
          <Field label="Assessed on"><input type="date" className="input" value={form.assessed_on} onChange={(e) => set('assessed_on', e.target.value)} /></Field>
          <Field label="Remarks"><input className="input lg:col-span-2" value={form.remarks} onChange={(e) => set('remarks', e.target.value)} /></Field>
          <div className="flex items-end lg:col-span-4">
            <button onClick={record} disabled={busy} className="ml-auto inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
              {busy ? 'Recording…' : 'Save mark'}
            </button>
          </div>
        </div>
      )}

      {loading ? <p className="text-sm text-gray-500">Loading academic record…</p> : rows.length === 0 ? (
        <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">No assessments recorded yet.{canEdit ? ' Record a mark above.' : ''}</p>
      ) : (
        <div className="space-y-4">
          {groups.map(([term, list]) => (
            <div key={term}>
              <p className="mb-1.5 text-sm font-semibold text-gray-800">{term}</p>
              <div className="overflow-x-auto rounded-lg border border-gray-100">
                <table className="w-full min-w-[620px] text-sm">
                  <thead><tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
                    <th className="px-3 py-2">Subject</th><th className="px-3 py-2 text-right">Score</th><th className="px-3 py-2">Grade</th>
                    <th className="px-3 py-2">Status</th><th className="px-3 py-2">Teacher</th>{canEdit && <th className="px-3 py-2" />}
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {list.map((a) => (
                      <tr key={a.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-800">{a.subject}<span className="ml-1.5 text-xs font-normal text-gray-400">{a.assessment_type}</span>{a.remarks && <span className="block text-xs font-normal text-gray-400">{a.remarks}</span>}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{a.score != null ? `${a.score}/${a.max_score}` : '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{a.grade || '—'}</td>
                        <td className="px-3 py-2">{a.status !== 'recorded' ? <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">{a.status}</span> : <span className="text-xs text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 text-gray-500">{a.teacher || '—'}</td>
                        {canEdit && <td className="px-3 py-2 text-right"><button onClick={() => remove(a.id)} disabled={busy} title="Delete" className="text-gray-300 hover:text-red-500"><Trash2 size={13} /></button></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>{children}</label>
}

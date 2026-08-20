'use client'

import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Plus, Receipt, UserPlus, X } from 'lucide-react'
import { api } from '@/lib/apiClient'
import type { SchoolProgrammeRow, SchoolFeeStructureRow, SchoolFeeStructureItemRow } from '@ocg/db'

type School = 'rayyan' | 'rhythms' | 'darul'
type StructureWithItems = SchoolFeeStructureRow & { items: SchoolFeeStructureItemRow[] }
type ChargeLine = { category_id: string | null; label: string; amount_ksh: number; billing_cadence: string; is_required: boolean }
type StudentOpt = { id: string; label: string; admission_number: string }

const money = (n: number) => `KSh ${Math.round(Number(n) || 0).toLocaleString()}`
const CADENCES = ['term', 'annual', 'monthly', 'one_off'] as const
const today = () => new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)

type ItemDraft = { label: string; amount_ksh: string; billing_cadence: string; is_required: boolean }
const blankItem = (): ItemDraft => ({ label: '', amount_ksh: '', billing_cadence: 'term', is_required: true })

export function RhythmsBilling({ school, students, canEdit, canBill }: {
  school: School
  students: StudentOpt[]
  canEdit: boolean
  canBill: boolean
}) {
  const [programmes, setProgrammes] = useState<SchoolProgrammeRow[]>([])
  const [structures, setStructures] = useState<StructureWithItems[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true); setError('')
    const { ok, data } = await api<{ programmes: SchoolProgrammeRow[]; structures: StructureWithItems[]; error?: string }>(`/api/school-billing?school=${school}`)
    if (!ok) { setError(data?.error ?? 'Could not load billing configuration.'); setLoading(false); return }
    setProgrammes(data.programmes ?? [])
    setStructures(data.structures ?? [])
    setLoading(false)
  }
  useEffect(() => { void load() }, [school]) // eslint-disable-line react-hooks/exhaustive-deps

  const programmeName = useMemo(() => new Map(programmes.map((p) => [p.id, p.name])), [programmes])

  // ── Programme form ─────────────────────────────────────────────────────────
  const [progForm, setProgForm] = useState({ id: '', name: '', kind: 'course', code: '', duration_label: '', completion_requirements: '' })
  const [showProg, setShowProg] = useState(false)
  function editProgramme(p: SchoolProgrammeRow) {
    setProgForm({ id: p.id, name: p.name, kind: p.kind, code: p.code, duration_label: p.duration_label, completion_requirements: p.completion_requirements })
    setShowProg(true)
  }
  async function saveProgramme() {
    if (!progForm.name.trim()) { setError('Programme name is required.'); return }
    setBusy(true); setError('')
    const { ok, data } = await api<{ error?: string }>('/api/school-billing', { method: 'POST', body: JSON.stringify({ action: 'upsert-programme', values: { school, ...progForm } }) })
    setBusy(false)
    if (!ok) { setError(data?.error ?? 'Failed to save programme.'); return }
    setProgForm({ id: '', name: '', kind: 'course', code: '', duration_label: '', completion_requirements: '' })
    setShowProg(false); void load()
  }
  async function toggleProgramme(p: SchoolProgrammeRow) {
    setBusy(true)
    await api('/api/school-billing', { method: 'POST', body: JSON.stringify({ action: 'toggle-programme', values: { school, id: p.id, name: p.name, is_active: !p.is_active } }) })
    setBusy(false); void load()
  }

  // ── Fee-structure form ─────────────────────────────────────────────────────
  const [structForm, setStructForm] = useState({ programme_id: '', name: '', academic_year: String(new Date().getFullYear()), effective_from: today() })
  const [items, setItems] = useState<ItemDraft[]>([blankItem()])
  const [showStruct, setShowStruct] = useState(false)
  async function saveStructure() {
    const clean = items.filter((it) => it.label.trim() && Number(it.amount_ksh) > 0)
    if (clean.length === 0) { setError('Add at least one fee item with an amount.'); return }
    setBusy(true); setError('')
    const { ok, data } = await api<{ error?: string }>('/api/school-billing', {
      method: 'POST',
      body: JSON.stringify({ action: 'create-structure', values: { school, ...structForm, programme_id: structForm.programme_id || null, items: clean.map((it) => ({ label: it.label.trim(), amount_ksh: Number(it.amount_ksh), billing_cadence: it.billing_cadence, is_required: it.is_required })) } }),
    })
    setBusy(false)
    if (!ok) { setError(data?.error ?? 'Failed to create fee structure.'); return }
    setItems([blankItem()]); setShowStruct(false); void load()
  }
  async function setStructureStatus(id: string, status: string) {
    setBusy(true)
    await api('/api/school-billing', { method: 'POST', body: JSON.stringify({ action: 'set-structure-status', values: { school, id, status } }) })
    setBusy(false); void load()
  }

  return (
    <div className="space-y-6">
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {/* Programmes */}
      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ocg-gold"><BookOpen size={14} /> Programmes &amp; courses</h2>
          {canEdit && <button onClick={() => { setShowProg((v) => !v); setProgForm({ id: '', name: '', kind: 'course', code: '', duration_label: '', completion_requirements: '' }) }} className="inline-flex items-center gap-1.5 rounded-lg bg-ocg-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"><Plus size={13} /> New programme</button>}
        </div>
        {canEdit && showProg && (
          <div className="mb-4 grid gap-3 rounded-lg border border-gray-100 bg-gray-50 p-4 lg:grid-cols-3">
            <Field label="Name"><input className="input" value={progForm.name} onChange={(e) => setProgForm((f) => ({ ...f, name: e.target.value }))} placeholder="Piano — Grade 1" /></Field>
            <Field label="Kind"><input className="input" value={progForm.kind} onChange={(e) => setProgForm((f) => ({ ...f, kind: e.target.value }))} placeholder="course / module" /></Field>
            <Field label="Code"><input className="input" value={progForm.code} onChange={(e) => setProgForm((f) => ({ ...f, code: e.target.value }))} /></Field>
            <Field label="Duration"><input className="input" value={progForm.duration_label} onChange={(e) => setProgForm((f) => ({ ...f, duration_label: e.target.value }))} placeholder="1 term" /></Field>
            <Field label="Completion requirements"><input className="input lg:col-span-2" value={progForm.completion_requirements} onChange={(e) => setProgForm((f) => ({ ...f, completion_requirements: e.target.value }))} /></Field>
            <div className="flex items-end justify-end lg:col-span-3"><button onClick={saveProgramme} disabled={busy} className="rounded-lg bg-ocg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{progForm.id ? 'Update' : 'Add'} programme</button></div>
          </div>
        )}
        {loading ? <p className="text-sm text-gray-500">Loading…</p> : programmes.length === 0 ? <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">No programmes yet.</p> : (
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400"><th className="px-3 py-2">Programme</th><th className="px-3 py-2">Kind</th><th className="px-3 py-2">Duration</th><th className="px-3 py-2">Status</th>{canEdit && <th className="px-3 py-2" />}</tr></thead>
              <tbody className="divide-y divide-gray-50">
                {programmes.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-800">{p.name}{p.code && <span className="ml-1.5 text-xs text-gray-400">{p.code}</span>}</td>
                    <td className="px-3 py-2 text-gray-500">{p.kind}</td>
                    <td className="px-3 py-2 text-gray-500">{p.duration_label || '—'}</td>
                    <td className="px-3 py-2">{p.is_active ? <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">active</span> : <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">inactive</span>}</td>
                    {canEdit && <td className="px-3 py-2 text-right"><button onClick={() => editProgramme(p)} className="mr-3 text-xs font-semibold text-gray-500 hover:text-ocg-gold">Edit</button><button onClick={() => toggleProgramme(p)} disabled={busy} className="text-xs font-semibold text-gray-400 hover:text-gray-700">{p.is_active ? 'Deactivate' : 'Activate'}</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Fee structures */}
      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ocg-gold"><Receipt size={14} /> Fee structures <span className="font-normal normal-case tracking-normal text-gray-400">(versioned)</span></h2>
          {canEdit && <button onClick={() => setShowStruct((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-ocg-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"><Plus size={13} /> New structure / version</button>}
        </div>
        {canEdit && showStruct && (
          <div className="mb-4 space-y-3 rounded-lg border border-gray-100 bg-gray-50 p-4">
            <div className="grid gap-3 lg:grid-cols-4">
              <Field label="Programme"><select className="input" value={structForm.programme_id} onChange={(e) => setStructForm((f) => ({ ...f, programme_id: e.target.value }))}><option value="">— General —</option>{programmes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
              <Field label="Name"><input className="input" value={structForm.name} onChange={(e) => setStructForm((f) => ({ ...f, name: e.target.value }))} placeholder="2026 fees" /></Field>
              <Field label="Academic year"><input className="input" value={structForm.academic_year} onChange={(e) => setStructForm((f) => ({ ...f, academic_year: e.target.value }))} /></Field>
              <Field label="Effective from"><input type="date" className="input" value={structForm.effective_from} onChange={(e) => setStructForm((f) => ({ ...f, effective_from: e.target.value }))} /></Field>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Fee items</p>
              {items.map((it, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_120px_120px_auto_auto]">
                  <input className="input" placeholder="Item (Tuition, Exam…)" value={it.label} onChange={(e) => setItems((arr) => arr.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                  <input type="number" className="input" placeholder="Amount" value={it.amount_ksh} onChange={(e) => setItems((arr) => arr.map((x, j) => j === i ? { ...x, amount_ksh: e.target.value } : x))} />
                  <select className="input" value={it.billing_cadence} onChange={(e) => setItems((arr) => arr.map((x, j) => j === i ? { ...x, billing_cadence: e.target.value } : x))}>{CADENCES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                  <label className="flex items-center gap-1.5 text-xs text-gray-600"><input type="checkbox" checked={it.is_required} onChange={(e) => setItems((arr) => arr.map((x, j) => j === i ? { ...x, is_required: e.target.checked } : x))} /> required</label>
                  <button onClick={() => setItems((arr) => arr.length > 1 ? arr.filter((_, j) => j !== i) : arr)} className="text-gray-300 hover:text-red-500"><X size={15} /></button>
                </div>
              ))}
              <button onClick={() => setItems((arr) => [...arr, blankItem()])} className="text-xs font-semibold text-ocg-gold hover:underline">+ Add item</button>
            </div>
            <div className="flex justify-end"><button onClick={saveStructure} disabled={busy} className="rounded-lg bg-ocg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Create structure</button></div>
          </div>
        )}
        {loading ? <p className="text-sm text-gray-500">Loading…</p> : structures.length === 0 ? <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">No fee structures yet.</p> : (
          <div className="space-y-3">
            {structures.map((s) => (
              <div key={s.id} className="rounded-lg border border-gray-100 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{s.name} <span className="text-xs font-normal text-gray-400">v{s.version} · {programmeName.get(s.programme_id ?? '') ?? 'General'}{s.academic_year ? ` · ${s.academic_year}` : ''}</span></p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={s.status} />
                    {canEdit && s.status !== 'active' && <button onClick={() => setStructureStatus(s.id, 'active')} disabled={busy} className="text-xs font-semibold text-emerald-600 hover:underline">Activate</button>}
                    {canEdit && s.status !== 'archived' && <button onClick={() => setStructureStatus(s.id, 'archived')} disabled={busy} className="text-xs font-semibold text-gray-400 hover:text-gray-700">Archive</button>}
                  </div>
                </div>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[420px] text-sm">
                    <tbody className="divide-y divide-gray-50">
                      {s.items.map((it) => (
                        <tr key={it.id}>
                          <td className="py-1.5 pr-2 text-gray-700">{it.label}{!it.is_required && <span className="ml-1.5 text-[10px] uppercase text-gray-400">optional</span>}</td>
                          <td className="py-1.5 pr-2 text-gray-400">{it.billing_cadence}</td>
                          <td className="py-1.5 text-right font-medium text-gray-700">{money(it.amount_ksh)}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-gray-200"><td className="py-1.5 pr-2 text-xs font-semibold uppercase text-gray-400">Required total</td><td /><td className="py-1.5 text-right font-semibold text-gray-800">{money(s.items.filter((it) => it.is_required).reduce((a, it) => a + Number(it.amount_ksh), 0))}</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Enrolment */}
      {canBill ? (
        <EnrolPanel school={school} students={students} structures={structures} programmeName={programmeName} onDone={load} />
      ) : (
        <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">Enrolling a student posts fee charges, which needs finance edit access. Ask an administrator.</p>
      )}
    </div>
  )
}

function EnrolPanel({ school, students, structures, programmeName, onDone }: {
  school: School
  students: StudentOpt[]
  structures: StructureWithItems[]
  programmeName: Map<string, string>
  onDone: () => void
}) {
  const [form, setForm] = useState({ student_id: '', fee_structure_id: '', academic_year: String(new Date().getFullYear()), term: '', includeOptional: false })
  const [preview, setPreview] = useState<{ schedule: ChargeLine[]; total: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const active = structures.filter((s) => s.status === 'active')

  async function doPreview() {
    if (!form.fee_structure_id) { setError('Pick a fee structure.'); return }
    setBusy(true); setError(''); setDone('')
    const { ok, data } = await api<{ schedule: ChargeLine[]; total: number; error?: string }>('/api/school-billing', { method: 'POST', body: JSON.stringify({ action: 'preview-enrollment', values: { school, fee_structure_id: form.fee_structure_id, includeOptional: form.includeOptional } }) })
    setBusy(false)
    if (!ok) { setError(data?.error ?? 'Preview failed.'); return }
    setPreview({ schedule: data.schedule ?? [], total: data.total ?? 0 })
  }

  async function enrol() {
    if (!form.student_id) { setError('Pick a student.'); return }
    if (!form.fee_structure_id) { setError('Pick a fee structure.'); return }
    setBusy(true); setError(''); setDone('')
    const student = students.find((s) => s.id === form.student_id)
    const { ok, data } = await api<{ schedule: ChargeLine[]; error?: string }>('/api/school-billing', {
      method: 'POST',
      body: JSON.stringify({ action: 'enrol', values: { school, student_id: form.student_id, student_admission_no: student?.admission_number ?? '', programme_id: active.find((s) => s.id === form.fee_structure_id)?.programme_id ?? null, fee_structure_id: form.fee_structure_id, academic_year: form.academic_year, term: form.term, includeOptional: form.includeOptional } }),
    })
    setBusy(false)
    if (!ok) { setError(data?.error ?? 'Enrolment failed.'); return }
    setDone(`Enrolled ${student?.label ?? 'student'} — ${data.schedule?.length ?? 0} draft charge(s) posted to their account for review.`)
    setPreview(null); setForm((f) => ({ ...f, student_id: '' })); onDone()
  }

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="mb-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ocg-gold"><UserPlus size={14} /> Enrol a student</h2>
      {error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {done && <p className="mb-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{done}</p>}
      <div className="grid gap-3 lg:grid-cols-4">
        <Field label="Student"><select className="input" value={form.student_id} onChange={(e) => setForm((f) => ({ ...f, student_id: e.target.value }))}><option value="">— Select —</option>{students.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
        <Field label="Fee structure"><select className="input" value={form.fee_structure_id} onChange={(e) => { setForm((f) => ({ ...f, fee_structure_id: e.target.value })); setPreview(null) }}><option value="">— Select —</option>{active.map((s) => <option key={s.id} value={s.id}>{s.name} v{s.version} · {programmeName.get(s.programme_id ?? '') ?? 'General'}</option>)}</select></Field>
        <Field label="Academic year"><input className="input" value={form.academic_year} onChange={(e) => setForm((f) => ({ ...f, academic_year: e.target.value }))} /></Field>
        <Field label="Term"><input className="input" value={form.term} onChange={(e) => setForm((f) => ({ ...f, term: e.target.value }))} placeholder="Term 1" /></Field>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={form.includeOptional} onChange={(e) => { setForm((f) => ({ ...f, includeOptional: e.target.checked })); setPreview(null) }} /> Include optional items</label>

      <div className="mt-3 flex gap-2">
        <button onClick={doPreview} disabled={busy} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:border-ocg-gold hover:text-ocg-gold disabled:opacity-60">Preview schedule</button>
        <button onClick={enrol} disabled={busy || !preview} title={!preview ? 'Preview first' : ''} className="rounded-lg bg-ocg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40">Enrol &amp; post draft schedule</button>
      </div>

      {preview && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-gray-100">
          <table className="w-full min-w-[420px] text-sm">
            <thead><tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400"><th className="px-3 py-2">Charge</th><th className="px-3 py-2">Cadence</th><th className="px-3 py-2 text-right">Amount</th></tr></thead>
            <tbody className="divide-y divide-gray-50">
              {preview.schedule.map((l, i) => <tr key={i}><td className="px-3 py-2 text-gray-700">{l.label}</td><td className="px-3 py-2 text-gray-400">{l.billing_cadence}</td><td className="px-3 py-2 text-right text-gray-700">{money(l.amount_ksh)}</td></tr>)}
              <tr className="border-t border-gray-200 font-semibold"><td className="px-3 py-2 text-gray-800">Total (posted as draft)</td><td /><td className="px-3 py-2 text-right text-gray-900">{money(preview.total)}</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === 'active' ? 'bg-emerald-50 text-emerald-700' : status === 'archived' ? 'bg-gray-100 text-gray-500' : 'bg-amber-50 text-amber-700'
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${tone}`}>{status}</span>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>{children}</label>
}

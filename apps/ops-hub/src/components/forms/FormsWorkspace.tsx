'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDown, ArrowUp, CheckCircle2, ClipboardList, FilePlus2, Pencil,
  Plus, Send, Trash2, X,
} from 'lucide-react'
import { api } from '@/lib/apiClient'
import type { OcgFormTemplateRow, OcgFormSubmissionRow, OcgFormFieldDef } from '@ocg/db'

type BrandOption = { id: string; label: string; slug: string }

interface FormsData {
  templates: OcgFormTemplateRow[]
  submissions: OcgFormSubmissionRow[]
  brands: BrandOption[]
  canManage: boolean
  canReviewAll: boolean
}

const FREQUENCIES = ['daily', 'weekly', 'monthly', 'termly', 'per_event'] as const
const FREQ_LABEL: Record<string, string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', termly: 'Termly', per_event: 'Per event',
}
const FIELD_TYPES: OcgFormFieldDef['type'][] = ['text', 'textarea', 'number', 'date', 'time', 'select', 'checkbox']

/**
 * The report-book workspace: pick a form (per brand), fill it, review recent
 * entries. Managers can build new forms and edit the seeded ones — the field
 * list is data, so every register (occurrence book, incident book, lesson
 * plan…) can be adjusted to match the physical books without code changes.
 */
export function FormsWorkspace({ initialBrandSlug = '' }: { initialBrandSlug?: string }) {
  const [data, setData] = useState<FormsData | null>(null)
  const [brandFilter, setBrandFilter] = useState(initialBrandSlug)
  const [selectedId, setSelectedId] = useState('')
  const [editing, setEditing] = useState<OcgFormTemplateRow | 'new' | null>(null)
  const [error, setError] = useState('')

  async function load() {
    const { ok, data: json } = await api<FormsData & { error?: string }>('/api/forms')
    if (!ok) { setError(json?.error ?? 'Failed to load forms.'); return }
    setData(json)
  }
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const brandBySlug = useMemo(() => new Map((data?.brands ?? []).map((b) => [b.slug, b])), [data])
  const brandById = useMemo(() => new Map((data?.brands ?? []).map((b) => [b.id, b])), [data])

  const visibleTemplates = useMemo(() => {
    const templates = data?.templates ?? []
    if (!brandFilter) return templates
    const brand = brandBySlug.get(brandFilter)
    return templates.filter((t) => !t.brand_id || t.brand_id === brand?.id)
  }, [data, brandFilter, brandBySlug])

  const selected = visibleTemplates.find((t) => t.id === selectedId)
    ?? (data?.templates ?? []).find((t) => t.id === selectedId)
    ?? null

  if (!data) {
    return <p className="text-sm text-gray-500">{error || 'Loading forms…'}</p>
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Report books &amp; registers</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-gray-900"><ClipboardList size={22} /> Forms</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            The daily, weekly, and termly reports each team fills — occurrence books, incident books,
            lesson plans, banking records, and any custom register. Pick a form and submit an entry.
          </p>
        </div>
        {data.canManage && (
          <button onClick={() => setEditing('new')}
            className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            <FilePlus2 size={15} /> New form
          </button>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <Chip active={!brandFilter} onClick={() => setBrandFilter('')}>All brands</Chip>
        {data.brands.map((b) => (
          <Chip key={b.id} active={brandFilter === b.slug} onClick={() => setBrandFilter(b.slug)}>{b.label}</Chip>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="h-fit rounded-xl border border-gray-100 bg-white shadow-sm">
          <p className="border-b border-gray-100 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Forms ({visibleTemplates.length})
          </p>
          <div className="max-h-[620px] overflow-y-auto p-2">
            {visibleTemplates.length === 0 ? (
              <p className="p-3 text-sm text-gray-400">No forms for this brand yet.</p>
            ) : visibleTemplates.map((t) => (
              <button key={t.id} onClick={() => setSelectedId(t.id)}
                className={`mb-1 w-full rounded-lg px-3 py-2.5 text-left transition-colors ${selected?.id === t.id ? 'bg-ocg-navy text-white' : 'hover:bg-gray-50'}`}>
                <p className={`text-sm font-semibold ${selected?.id === t.id ? 'text-white' : 'text-gray-800'} ${!t.is_active ? 'line-through opacity-60' : ''}`}>{t.name}</p>
                <p className={`mt-0.5 text-xs ${selected?.id === t.id ? 'text-white/60' : 'text-gray-400'}`}>
                  {FREQ_LABEL[t.frequency] ?? t.frequency}
                  {t.brand_id ? ` · ${brandById.get(t.brand_id)?.label ?? ''}` : ' · Group-wide'}
                  {!t.is_active ? ' · archived' : ''}
                </p>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0 space-y-5">
          {!selected ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center text-sm text-gray-400">
              Select a form on the left to fill it or review entries.
            </div>
          ) : (
            <>
              <FillForm
                key={selected.id}
                template={selected}
                onSubmitted={load}
                onEdit={data.canManage ? () => setEditing(selected) : undefined}
              />
              <SubmissionsList
                template={selected}
                submissions={data.submissions.filter((s) => s.template_id === selected.id)}
                canReviewAll={data.canReviewAll}
              />
            </>
          )}
        </section>
      </div>

      {editing && (
        <TemplateEditor
          template={editing === 'new' ? null : editing}
          brands={data.brands}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load() }}
        />
      )}
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${active ? 'border-ocg-navy bg-ocg-navy text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-ocg-gold/50'}`}>
      {children}
    </button>
  )
}

// ─── Fill a form ──────────────────────────────────────────────────────────────
function FillForm({ template, onSubmitted, onEdit }: {
  template: OcgFormTemplateRow
  onSubmitted: () => void
  onEdit?: () => void
}) {
  const today = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const [values, setValues] = useState<Record<string, string | boolean>>({})
  const [date, setDate] = useState(today)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  function set(key: string, value: string | boolean) {
    setValues((c) => ({ ...c, [key]: value }))
  }

  async function submit() {
    setError(''); setSuccess(''); setSaving(true)
    const { ok, data } = await api<{ error?: string }>('/api/forms', {
      method: 'POST',
      body: JSON.stringify({ action: 'submit', template_id: template.id, values, submission_date: date }),
    })
    setSaving(false)
    if (!ok) { setError(data?.error ?? 'Failed to submit.'); return }
    setSuccess('Entry recorded.')
    setValues({})
    onSubmitted()
  }

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{template.name}</h2>
          {template.description && <p className="mt-0.5 text-sm text-gray-500">{template.description}</p>}
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-ocg-gold">{FREQ_LABEL[template.frequency] ?? template.frequency}</p>
        </div>
        {onEdit && (
          <button onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-ocg-gold hover:text-ocg-gold">
            <Pencil size={13} /> Edit form
          </button>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500">Entry date</span>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {template.fields.map((field) => (
          <FieldInput key={field.key} field={field} value={values[field.key]} onChange={(v) => set(field.key, v)} />
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 size={15} /> {success}</p>}
      <div className="mt-4 flex justify-end">
        <button onClick={submit} disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
          <Send size={14} /> {saving ? 'Submitting…' : 'Submit entry'}
        </button>
      </div>
    </section>
  )
}

function FieldInput({ field, value, onChange }: {
  field: OcgFormFieldDef
  value: string | boolean | undefined
  onChange: (v: string | boolean) => void
}) {
  const label = `${field.label}${field.required ? ' *' : ''}`
  if (field.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 self-end rounded-lg border border-gray-100 px-3 py-2.5">
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[#1a1a2e]" />
        <span className="text-sm text-gray-700">{label}</span>
      </label>
    )
  }
  return (
    <label className={`block ${field.type === 'textarea' ? 'lg:col-span-3' : ''}`}>
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      {field.type === 'textarea' ? (
        <textarea className="input min-h-[70px]" placeholder={field.placeholder ?? ''} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
      ) : field.type === 'select' ? (
        <select className="input" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={field.type === 'number' ? 'number' : field.type} className="input" placeholder={field.placeholder ?? ''} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  )
}

// ─── Recent entries ───────────────────────────────────────────────────────────
function SubmissionsList({ template, submissions, canReviewAll }: {
  template: OcgFormTemplateRow
  submissions: OcgFormSubmissionRow[]
  canReviewAll: boolean
}) {
  const fieldLabel = new Map(template.fields.map((f) => [f.key, f.label]))
  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-ocg-gold">
        Recent entries ({submissions.length})
      </h2>
      <p className="mb-4 text-xs text-gray-400">
        {canReviewAll ? 'Showing all submissions for this form.' : 'Showing your own submissions.'}
      </p>
      {submissions.length === 0 ? (
        <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">No entries yet.</p>
      ) : (
        <div className="space-y-3">
          {submissions.slice(0, 30).map((s) => (
            <div key={s.id} className="rounded-lg border border-gray-100 p-4">
              <p className="text-xs font-semibold text-gray-500">
                {s.submission_date} · {s.submitted_by_name || s.submitted_by}
              </p>
              <dl className="mt-2 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                {Object.entries(s.values).map(([key, value]) => {
                  const text = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value ?? '')
                  if (!text) return null
                  return (
                    <div key={key} className="min-w-0">
                      <dt className="text-xs text-gray-400">{fieldLabel.get(key) ?? key}</dt>
                      <dd className="whitespace-pre-wrap break-words font-medium text-gray-800">{text}</dd>
                    </div>
                  )
                })}
              </dl>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ─── Template editor (managers) ───────────────────────────────────────────────
interface EditableField {
  key: string
  label: string
  type: OcgFormFieldDef['type']
  required: boolean
  options: string
}

function TemplateEditor({ template, brands, onClose, onSaved }: {
  template: OcgFormTemplateRow | null
  brands: BrandOption[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(template?.name ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [brandId, setBrandId] = useState(template?.brand_id ?? '')
  const [frequency, setFrequency] = useState(template?.frequency ?? 'daily')
  const [isActive, setIsActive] = useState(template?.is_active ?? true)
  const [fields, setFields] = useState<EditableField[]>(
    (template?.fields ?? []).map((f) => ({
      key: f.key, label: f.label, type: f.type, required: f.required ?? false, options: (f.options ?? []).join(', '),
    })),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function addField() {
    setFields((c) => [...c, { key: '', label: '', type: 'text', required: false, options: '' }])
  }
  function patchField(index: number, patch: Partial<EditableField>) {
    setFields((c) => c.map((f, i) => (i === index ? { ...f, ...patch } : f)))
  }
  function move(index: number, delta: number) {
    setFields((c) => {
      const next = [...c]
      const target = index + delta
      if (target < 0 || target >= next.length) return c
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  async function save() {
    setError('')
    if (!name.trim()) { setError('Give the form a name.'); return }
    const payloadFields = fields
      .filter((f) => f.label.trim())
      .map((f) => ({
        key: f.key || undefined,
        label: f.label.trim(),
        type: f.type,
        required: f.required,
        options: f.type === 'select' ? f.options : undefined,
      }))
    if (payloadFields.length === 0) { setError('Add at least one field.'); return }
    setSaving(true)
    const body = template
      ? { id: template.id, values: { name, description, brand_id: brandId, frequency, fields: payloadFields, is_active: isActive } }
      : { action: 'create-template', values: { name, description, brand_id: brandId, frequency, fields: payloadFields } }
    const { ok, data } = await api<{ error?: string }>('/api/forms', {
      method: template ? 'PATCH' : 'POST',
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (!ok) { setError(data?.error ?? 'Failed to save.'); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-4 flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <p className="font-semibold text-gray-900">{template ? `Edit form — ${template.name}` : 'New form'}</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="space-y-4 overflow-y-auto p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-gray-500">Form name *</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Daily Occurrence Book" />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-gray-500">Description</span>
              <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Brand</span>
              <select className="input" value={brandId ?? ''} onChange={(e) => setBrandId(e.target.value)}>
                <option value="">Group-wide (all brands)</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Fill rhythm</span>
              <select className="input" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                {FREQUENCIES.map((f) => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}
              </select>
            </label>
            {template && (
              <label className="flex items-center gap-2 self-end rounded-lg border border-gray-100 px-3 py-2.5">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 accent-[#1a1a2e]" />
                <span className="text-sm text-gray-700">Active (unchecked = archived)</span>
              </label>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Fields</p>
            <div className="space-y-2">
              {fields.map((f, i) => (
                <div key={i} className="grid gap-2 rounded-lg bg-gray-50 p-2.5 lg:grid-cols-[2fr_1fr_2fr_auto_auto]">
                  <input className="input" placeholder="Field label *" value={f.label} onChange={(e) => patchField(i, { label: e.target.value })} />
                  <select className="input" value={f.type} onChange={(e) => patchField(i, { type: e.target.value as OcgFormFieldDef['type'] })}>
                    {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input className="input" placeholder={f.type === 'select' ? 'Options, comma separated' : '—'}
                    disabled={f.type !== 'select'} value={f.options} onChange={(e) => patchField(i, { options: e.target.value })} />
                  <label className="flex items-center gap-1.5 px-1 text-xs text-gray-600">
                    <input type="checkbox" checked={f.required} onChange={(e) => patchField(i, { required: e.target.checked })} className="h-3.5 w-3.5 accent-[#1a1a2e]" /> Req
                  </label>
                  <div className="flex items-center gap-1">
                    <button onClick={() => move(i, -1)} className="rounded border border-gray-200 p-1 text-gray-400 hover:text-gray-700"><ArrowUp size={12} /></button>
                    <button onClick={() => move(i, 1)} className="rounded border border-gray-200 p-1 text-gray-400 hover:text-gray-700"><ArrowDown size={12} /></button>
                    <button onClick={() => setFields((c) => c.filter((_, idx) => idx !== i))} className="rounded border border-gray-200 p-1 text-gray-400 hover:text-red-500"><Trash2 size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={addField}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-ocg-gold hover:text-ocg-gold">
              <Plus size={13} /> Add field
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">Cancel</button>
          <button onClick={save} disabled={saving}
            className="rounded-lg bg-ocg-navy px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
            {saving ? 'Saving…' : template ? 'Save changes' : 'Create form'}
          </button>
        </div>
      </div>
    </div>
  )
}

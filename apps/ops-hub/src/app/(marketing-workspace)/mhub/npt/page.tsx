'use client'

import { useEffect, useRef, useState } from 'react'
import type { PianoCatalogue } from '@ocg/db'
import { getClient } from '@/lib/supabase'
import {
  AlertCircle, CheckCircle, Download, Eye, Music2,
  Plus, RefreshCw, Save, Upload, X,
} from 'lucide-react'

const NPT_BUCKET = 'npt-catalogue'
const NPT_URL = process.env['NEXT_PUBLIC_NPT_SALES_URL'] ?? 'http://localhost:3001'

// ─── Types ────────────────────────────────────────────────────────────────────
type PianoForm = {
  id?: string
  slug: string
  name: string
  model: string
  serial: string
  category: string
  condition: string
  price: string
  status: string
  description: string
  highlights: string    // one per line
  finish: string
  size: string
  images: string        // one URL per line
  featured: boolean
  is_active: boolean
  sort_order: string
}

const EMPTY_FORM: PianoForm = {
  slug: '', name: '', model: '', serial: '',
  category: 'Upright', condition: '', price: 'Enquire',
  status: 'Available', description: '',
  highlights: '', finish: '', size: '',
  images: '', featured: false, is_active: true, sort_order: '0',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function linesToArray(s: string) {
  return s.split('\n').map(l => l.trim()).filter(Boolean)
}

function arrayToLines(arr: string[]) {
  return arr.join('\n')
}

function pianoToForm(p: PianoCatalogue): PianoForm {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    model: p.model ?? '',
    serial: p.serial ?? '',
    category: p.category ?? 'Upright',
    condition: p.condition ?? '',
    price: p.price,
    status: p.status ?? 'Available',
    description: p.description ?? '',
    highlights: arrayToLines(p.highlights ?? []),
    finish: p.finish ?? '',
    size: p.size ?? '',
    images: arrayToLines(p.images ?? []),
    featured: p.featured,
    is_active: p.is_active,
    sort_order: String(p.sort_order),
  }
}

function formToPayload(form: PianoForm) {
  return {
    ...(form.id ? { id: form.id } : {}),
    slug: form.slug.trim(),
    name: form.name.trim(),
    model: form.model.trim() || null,
    serial: form.serial.trim() || null,
    category: form.category,
    condition: form.condition.trim() || null,
    price: form.price.trim() || 'Enquire',
    status: form.status,
    description: form.description.trim() || null,
    highlights: linesToArray(form.highlights),
    finish: form.finish.trim() || null,
    size: form.size.trim() || null,
    images: linesToArray(form.images),
    featured: form.featured,
    is_active: form.is_active,
    sort_order: Number(form.sort_order) || 0,
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  )
}

const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-ocg-navy'

function TextField({ label, value, onChange, type = 'text', required, placeholder }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; required?: boolean; placeholder?: string
}) {
  return (
    <Field label={label}>
      <input type={type} value={value} required={required} placeholder={placeholder}
        onChange={e => onChange(e.target.value)} className={inputCls} />
    </Field>
  )
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={e => onChange(e.target.value)} className={inputCls}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </Field>
  )
}

function TextArea({ label, value, onChange, rows = 4, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string
}) {
  return (
    <Field label={label}>
      <textarea value={value} rows={rows} placeholder={placeholder}
        onChange={e => onChange(e.target.value)} className={inputCls} />
    </Field>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function NptAdminPage() {
  const [pianos, setPianos] = useState<PianoCatalogue[]>([])
  const [form, setForm] = useState<PianoForm>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const importRef = useRef<HTMLInputElement>(null)

  // Group by category for sidebar
  const grouped = pianos.reduce<Record<string, PianoCatalogue[]>>((acc, p) => {
    const key = p.category ?? 'Other'
    acc[key] = [...(acc[key] ?? []), p]
    return acc
  }, {})

  function update<K extends keyof PianoForm>(key: K, value: PianoForm[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  // ── API helpers ────────────────────────────────────────────────────────────
  async function authHeaders() {
    const supabase = getClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Session expired — please sign in again.')
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }
  }

  async function loadPianos() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/mhub/npt', { headers: await authHeaders() })
      const json = await res.json() as { pianos?: PianoCatalogue[]; error?: string }
      if (!res.ok) throw new Error(json.error)
      const list = json.pianos ?? []
      setPianos(list)
      if (!form.id && list[0]) setForm(pianoToForm(list[0]))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load catalogue.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadPianos() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function savePiano() {
    setSaving(true); setError(''); setMessage('')
    try {
      const payload = formToPayload(form)
      if (!payload.slug || !payload.name) throw new Error('Slug and name are required.')
      const headers = await authHeaders()
      const res = await fetch('/api/mhub/npt', {
        method: form.id ? 'PATCH' : 'POST',
        headers,
        body: JSON.stringify(payload),
      })
      const json = await res.json() as { piano?: PianoCatalogue; error?: string }
      if (!res.ok) throw new Error(json.error)
      const saved = json.piano!
      setPianos(prev => {
        const exists = prev.some(p => p.id === saved.id)
        const next = exists ? prev.map(p => p.id === saved.id ? saved : p) : [...prev, saved]
        return next.sort((a, b) => a.sort_order - b.sort_order)
      })
      setForm(pianoToForm(saved))
      setMessage('Piano saved successfully.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  async function exportCSV() {
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/mhub/npt/export', { headers })
      if (!res.ok) throw new Error('Export failed.')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `npt-catalogue-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.')
    }
  }

  async function importCSV(file: File) {
    setImporting(true); setError(''); setMessage('')
    try {
      const text = await file.text()
      const headers = await authHeaders()
      const res = await fetch('/api/mhub/npt/import', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'text/csv' },
        body: text,
      })
      const json = await res.json() as { imported?: number; error?: string }
      if (!res.ok) throw new Error(json.error)
      setMessage(`Imported ${json.imported} piano${json.imported !== 1 ? 's' : ''} successfully.`)
      await loadPianos()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.')
    } finally {
      setImporting(false)
      if (importRef.current) importRef.current.value = ''
    }
  }

  async function uploadImages(files: FileList | null) {
    if (!files?.length) return
    setUploading(true); setError(''); setMessage('')
    try {
      const supabase = getClient()
      const folder = (form.slug.trim() || 'new-piano')
        .toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')

      const urls: string[] = []
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue
        const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
        const safeName = file.name
          .replace(/\.[^/.]+$/, '').toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
        const path = `${folder}/${Date.now()}-${safeName || 'photo'}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from(NPT_BUCKET)
          .upload(path, file, { cacheControl: '31536000', upsert: false })
        if (uploadError) throw new Error(uploadError.message)

        const { data } = supabase.storage.from(NPT_BUCKET).getPublicUrl(path)
        urls.push(data.publicUrl)
      }
      if (!urls.length) throw new Error('No image files were selected.')

      const existing = linesToArray(form.images)
      update('images', [...existing, ...urls].join('\n'))
      setMessage(`${urls.length} image${urls.length === 1 ? '' : 's'} uploaded. Save the piano to publish.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Music2 size={20} className="text-npt-gold" style={{ color: '#b8960c' }} />
            <h1 className="font-bold text-2xl text-gray-900">NPT Piano Catalogue</h1>
          </div>
          <p className="text-gray-500 text-sm">Manage the Nairobi Piano Technicians showroom catalogue, pricing, and images.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`${NPT_URL}/catalogue`}
            target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Eye size={15} />
            View Catalogue
          </a>
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download size={15} />
            Export CSV
          </button>
          <label className={`inline-flex items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer ${importing ? 'opacity-60 pointer-events-none' : ''}`}>
            {importing ? <RefreshCw size={15} className="animate-spin" /> : <Upload size={15} />}
            {importing ? 'Importing…' : 'Import CSV'}
            <input
              ref={importRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={e => { const f = e.target.files?.[0]; if (f) void importCSV(f) }}
            />
          </label>
          <button
            onClick={() => { setForm(EMPTY_FORM); setMessage(''); setError('') }}
            className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus size={15} />
            New Piano
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
        {/* ── Sidebar piano list ── */}
        <aside className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">Catalogue ({pianos.length})</p>
            <button onClick={loadPianos} title="Refresh">
              <RefreshCw size={14} className={`text-gray-400 hover:text-gray-700 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="max-h-[680px] overflow-y-auto p-2 space-y-1">
            {loading ? (
              <p className="p-4 text-sm text-gray-400">Loading…</p>
            ) : pianos.length === 0 ? (
              <p className="p-4 text-sm text-gray-400">No pianos yet. Add one or import CSV.</p>
            ) : (
              Object.entries(grouped).map(([cat, catPianos]) => (
                <div key={cat}>
                  <p className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    {cat} ({catPianos.length})
                  </p>
                  {catPianos.map(p => {
                    const active = p.id === form.id
                    const mainImg = p.images?.[0]
                    const isRelative = mainImg?.startsWith('/mhub')
                    return (
                      <button
                        key={p.id}
                        onClick={() => { setForm(pianoToForm(p)); setMessage(''); setError('') }}
                        className={`w-full rounded-xl p-2.5 text-left transition-colors ${active ? 'bg-ocg-navy' : 'hover:bg-gray-50'}`}
                      >
                        <div className="flex gap-2.5 items-center">
                          <div className={`h-10 w-10 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0 ${active ? 'bg-white/10' : 'bg-gray-100'}`}>
                            {mainImg ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={isRelative ? `${NPT_URL}${mainImg}` : mainImg}
                                alt=""
                                className="h-full w-full object-cover"
                                onError={e => { e.currentTarget.style.display = 'none' }}
                              />
                            ) : (
                              <Music2 size={16} className={active ? 'text-white/40' : 'text-gray-300'} />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={`truncate text-xs font-semibold ${active ? 'text-white' : 'text-gray-900'}`}>
                              {p.name}
                            </p>
                            <p className={`text-[10px] mt-0.5 ${active ? 'text-white/50' : 'text-gray-400'}`}>
                              {p.price} · {p.status}
                            </p>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </aside>

        {/* ── Editor ── */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">
              {form.id ? `Editing — ${form.name || 'piano'}` : 'New Piano'}
            </p>
            {form.id && (
              <a href={`${NPT_URL}/catalogue/${form.slug}`} target="_blank" rel="noreferrer"
                className="text-xs text-ocg-navy hover:underline flex items-center gap-1">
                <Eye size={12} /> Preview
              </a>
            )}
          </div>

          <div className="p-5 space-y-6">
            {message && (
              <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
                <CheckCircle size={16} /> {message}
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle size={16} /> {error}
              </div>
            )}

            {/* Identity */}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Identity</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <TextField label="Piano name *" value={form.name} required onChange={v => update('name', v)} />
                <TextField label="Slug *" value={form.slug} required onChange={v => update('slug', v)} placeholder="e.g. yamaha-u1-a" />
                <SelectField label="Category" value={form.category} onChange={v => update('category', v)}
                  options={['Upright', 'Grand', 'Digital']} />
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <TextField label="Model" value={form.model} onChange={v => update('model', v)} placeholder="e.g. U1" />
                <TextField label="Serial number" value={form.serial} onChange={v => update('serial', v)} placeholder="e.g. M3418257" />
              </div>
            </div>

            {/* Condition & Pricing */}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Condition &amp; Pricing</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <TextField label="Price" value={form.price} onChange={v => update('price', v)} placeholder="e.g. KSh 485,000" />
                <SelectField label="Status" value={form.status} onChange={v => update('status', v)}
                  options={['Available', 'Reserved', 'Sold']} />
                <TextField label="Condition" value={form.condition} onChange={v => update('condition', v)} placeholder="e.g. Grade A Reconditioned" />
                <TextField label="Instrument size" value={form.size} onChange={v => update('size', v)} placeholder="e.g. 121cm upright" />
              </div>
              <div className="mt-4">
                <TextField label="Finish" value={form.finish} onChange={v => update('finish', v)} placeholder="e.g. Polished Ebony" />
              </div>
            </div>

            {/* Description */}
            <TextArea label="Description" value={form.description} onChange={v => update('description', v)} rows={4} />

            {/* Highlights */}
            <TextArea
              label="Highlights — one per line"
              value={form.highlights}
              onChange={v => update('highlights', v)}
              rows={4}
              placeholder={"Rich warm tone\nResponsive touch\nOriginally made in Japan"}
            />

            {/* Images */}
            <div className="space-y-3">
              <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Images
              </span>

              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4">
                <label className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 text-center ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
                  <Upload size={22} className="text-gray-400" />
                  <span className="text-sm font-semibold text-gray-900">
                    {uploading ? 'Uploading…' : 'Upload piano images'}
                  </span>
                  <span className="text-xs text-gray-500">JPG, PNG or WebP · multiple allowed · first image is the main card image</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={uploading}
                    onChange={e => { void uploadImages(e.target.files); e.currentTarget.value = '' }}
                    className="sr-only"
                  />
                </label>
              </div>

              {/* Image grid with drag-to-reorder */}
              {linesToArray(form.images).length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {linesToArray(form.images).map((url, i, arr) => {
                    const isRelative = url.startsWith('/mhub')
                    const src = isRelative ? `${NPT_URL}${url}` : url
                    return (
                      <div
                        key={url}
                        draggable
                        onDragStart={e => e.dataTransfer.setData('text/plain', String(i))}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => {
                          e.preventDefault()
                          const from = Number(e.dataTransfer.getData('text/plain'))
                          if (from === i) return
                          const next = [...arr]
                          const [moved] = next.splice(from, 1)
                          next.splice(i, 0, moved)
                          update('images', next.join('\n'))
                        }}
                        className="group relative aspect-square overflow-hidden rounded-lg bg-gray-100 cursor-grab active:cursor-grabbing"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" className="h-full w-full object-cover"
                          onError={e => { e.currentTarget.style.opacity = '0' }} />
                        <span className="absolute top-1 left-1 bg-black/60 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                          {i + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => update('images', arr.filter((_, j) => j !== i).join('\n'))}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs leading-none"
                          aria-label="Remove image"
                        >
                          <X size={10} />
                        </button>
                        {i === 0 && (
                          <span className="absolute bottom-1 left-1 right-1 bg-black/70 text-white text-[9px] text-center rounded py-0.5 font-semibold">
                            MAIN
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              <details className="text-xs text-gray-400">
                <summary className="cursor-pointer select-none hover:text-gray-600 transition-colors py-1">
                  Edit URLs manually
                </summary>
                <textarea
                  value={form.images}
                  rows={4}
                  onChange={e => update('images', e.target.value)}
                  className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-ocg-navy font-mono"
                  placeholder={`/images/catalogue/slide01_img1.jpg\nhttps://storage.supabase.co/...`}
                />
              </details>
            </div>

            {/* Toggles */}
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField label="Sort order" type="number" value={form.sort_order} onChange={v => update('sort_order', v)} />
              <div className="flex flex-col gap-2 pt-5">
                {([
                  ['is_active', 'Active on site'] as const,
                  ['featured', 'Featured in hero'] as const,
                ]).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={form[key] as boolean}
                      onChange={e => update(key, e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-ocg-navy" />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* Save */}
            <div className="flex justify-end border-t border-gray-100 pt-5">
              <button
                onClick={savePiano}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
              >
                <Save size={16} />
                {saving ? 'Saving…' : 'Save Piano'}
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* CSV format reference */}
      <details className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-500">
        <summary className="cursor-pointer font-semibold text-gray-700 select-none">
          CSV Import Format Reference
        </summary>
        <div className="mt-3 space-y-2">
          <p>The CSV file must have a header row with these columns (order doesn&apos;t matter):</p>
          <code className="block bg-white rounded-lg p-3 text-[11px] border border-gray-200 overflow-x-auto whitespace-pre">
{`slug, name, model, serial, category, condition, price, status,
description, highlights, finish, size, images, featured, is_active, sort_order`}
          </code>
          <ul className="space-y-1 mt-2">
            <li><strong>category</strong> — <code>Upright</code>, <code>Grand</code>, or <code>Digital</code></li>
            <li><strong>status</strong> — <code>Available</code>, <code>Reserved</code>, or <code>Sold</code></li>
            <li><strong>highlights</strong> — pipe-separated list, e.g. <code>Rich warm tone|Responsive touch|Made in Japan</code></li>
            <li><strong>images</strong> — pipe-separated URLs, e.g. <code>/images/catalogue/slide01_img1.jpg|https://cdn.example.com/img2.jpg</code></li>
            <li>Rows are <strong>upserted</strong> on <code>slug</code> — existing pianos are updated, new slugs are inserted.</li>
          </ul>
        </div>
      </details>
    </div>
  )
}

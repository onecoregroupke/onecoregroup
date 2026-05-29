'use client'

import { useEffect, useRef, useState } from 'react'
import type { Product, ProductSize } from '@ocg/db'
import { getClient, getSession } from '@/lib/supabase'
import {
  AlertCircle, CheckCircle, Download, Eye, Package,
  Plus, RefreshCw, Save, Sparkles, Upload, X,
} from 'lucide-react'

const GLITZ_BUCKET = 'glitz-products'

const GLITZ_URL = process.env['NEXT_PUBLIC_GLITZ_URL'] ?? 'http://localhost:3002'

// ─── Types ────────────────────────────────────────────────────────────────────
type SizeRow = { label: string; price_ksh: string }

type ProductForm = {
  id?: string
  slug: string
  name: string
  variant: string
  category: string
  category_display_name: string
  category_accent: string
  description: string
  usage_instructions: string
  features: string         // one per line
  images: string           // one URL per line
  sizes: SizeRow[]
  is_active: boolean
  is_featured: boolean
  is_in_stock: boolean
  sort_order: string
}

const EMPTY_FORM: ProductForm = {
  slug: '', name: '', variant: '',
  category: '', category_display_name: '', category_accent: '#000000',
  description: '', usage_instructions: '',
  features: '', images: '',
  sizes: [{ label: '', price_ksh: '100' }],
  is_active: true, is_featured: false, is_in_stock: true,
  sort_order: '0',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function linesToArray(s: string) {
  return s.split('\n').map(l => l.trim()).filter(Boolean)
}

function arrayToLines(arr: string[]) {
  return arr.join('\n')
}

function productToForm(p: Product): ProductForm {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    variant: p.variant ?? '',
    category: p.category ?? '',
    category_display_name: p.category_display_name ?? '',
    category_accent: p.category_accent ?? '#000000',
    description: p.description ?? '',
    usage_instructions: p.usage_instructions ?? '',
    features: arrayToLines(p.features ?? []),
    images: arrayToLines(p.images ?? []),
    sizes: (p.sizes ?? []).length
      ? p.sizes.map(s => ({ label: s.label, price_ksh: String(s.price_ksh) }))
      : [{ label: '', price_ksh: '100' }],
    is_active: p.is_active,
    is_featured: p.is_featured,
    is_in_stock: p.is_in_stock,
    sort_order: String(p.sort_order),
  }
}

function formToPayload(form: ProductForm) {
  const sizes: ProductSize[] = form.sizes
    .filter(s => s.label.trim())
    .map(s => ({ label: s.label.trim(), price_ksh: Number(s.price_ksh) || 0 }))

  return {
    ...(form.id ? { id: form.id } : {}),
    slug: form.slug.trim(),
    name: form.name.trim(),
    variant: form.variant.trim() || null,
    category: form.category.trim() || null,
    category_display_name: form.category_display_name.trim() || null,
    category_accent: form.category_accent.trim() || null,
    description: form.description.trim() || null,
    usage_instructions: form.usage_instructions.trim() || null,
    features: linesToArray(form.features),
    images: linesToArray(form.images),
    sizes,
    is_active: form.is_active,
    is_featured: form.is_featured,
    is_in_stock: form.is_in_stock,
    sort_order: Number(form.sort_order) || 0,
    before_after_images: [],
    price_ksh: null,
    compare_price_ksh: null,
    short_description: null,
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

function TextField({ label, value, onChange, type = 'text', required }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean
}) {
  return (
    <Field label={label}>
      <input type={type} value={value} required={required}
        onChange={e => onChange(e.target.value)} className={inputCls} />
    </Field>
  )
}

function TextArea({ label, value, onChange, rows = 4 }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number
}) {
  return (
    <Field label={label}>
      <textarea value={value} rows={rows} onChange={e => onChange(e.target.value)} className={inputCls} />
    </Field>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function GlitzAdminPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const importRef = useRef<HTMLInputElement>(null)

  // Group products by category for the sidebar list
  const grouped = products.reduce<Record<string, Product[]>>((acc, p) => {
    const key = p.category ?? 'uncategorised'
    acc[key] = [...(acc[key] ?? []), p]
    return acc
  }, {})

  function update<K extends keyof ProductForm>(key: K, value: ProductForm[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function updateSize(idx: number, field: keyof SizeRow, value: string) {
    setForm(f => {
      const sizes = [...f.sizes]
      sizes[idx] = { ...sizes[idx], [field]: value }
      return { ...f, sizes }
    })
  }

  function addSize() {
    setForm(f => ({ ...f, sizes: [...f.sizes, { label: '', price_ksh: '100' }] }))
  }

  function removeSize(idx: number) {
    setForm(f => ({ ...f, sizes: f.sizes.filter((_, i) => i !== idx) }))
  }

  // ── API helpers ────────────────────────────────────────────────────────────
  async function authHeaders() {
    const supabase = getClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Session expired — please sign in again.')
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }
  }

  async function loadProducts() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/glitz', { headers: await authHeaders() })
      const json = await res.json() as { products?: Product[]; error?: string }
      if (!res.ok) throw new Error(json.error)
      const list = json.products ?? []
      setProducts(list)
      if (!form.id && list[0]) setForm(productToForm(list[0]))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load products.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadProducts() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveProduct() {
    setSaving(true); setError(''); setMessage('')
    try {
      const payload = formToPayload(form)
      if (!payload.slug || !payload.name) throw new Error('Slug and name are required.')
      const headers = await authHeaders()
      const res = await fetch('/api/glitz', {
        method: form.id ? 'PATCH' : 'POST',
        headers,
        body: JSON.stringify(payload),
      })
      const json = await res.json() as { product?: Product; error?: string }
      if (!res.ok) throw new Error(json.error)
      const saved = json.product!
      setProducts(prev => {
        const exists = prev.some(p => p.id === saved.id)
        const next = exists ? prev.map(p => p.id === saved.id ? saved : p) : [...prev, saved]
        return next.sort((a, b) => a.sort_order - b.sort_order)
      })
      setForm(productToForm(saved))
      setMessage('Product saved successfully.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  async function exportCSV() {
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/glitz/export', { headers })
      if (!res.ok) throw new Error('Export failed.')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `glitz-catalogue-${new Date().toISOString().slice(0, 10)}.csv`
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
      const res = await fetch('/api/glitz/import', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'text/csv' },
        body: text,
      })
      const json = await res.json() as { imported?: number; error?: string }
      if (!res.ok) throw new Error(json.error)
      setMessage(`Imported ${json.imported} product${json.imported !== 1 ? 's' : ''} successfully.`)
      await loadProducts()
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
      const folder = (form.slug.trim() || 'new-product')
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
          .from(GLITZ_BUCKET)
          .upload(path, file, { cacheControl: '31536000', upsert: false })
        if (uploadError) throw new Error(uploadError.message)

        const { data } = supabase.storage.from(GLITZ_BUCKET).getPublicUrl(path)
        urls.push(data.publicUrl)
      }
      if (!urls.length) throw new Error('No image files were selected.')

      const existing = linesToArray(form.images)
      update('images', [...existing, ...urls].join('\n'))
      setMessage(`${urls.length} image${urls.length === 1 ? '' : 's'} uploaded. Save the product to publish.`)
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
            <Sparkles size={20} className="text-amber-500" />
            <h1 className="font-bold text-2xl text-gray-900">Glitz N&apos; Glim</h1>
          </div>
          <p className="text-gray-500 text-sm">Manage product catalogue, pricing per size, and images.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`${GLITZ_URL}`}
            target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Eye size={15} />
            View Site
          </a>
          {/* Export */}
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download size={15} />
            Export CSV
          </button>
          {/* Import */}
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
          {/* New */}
          <button
            onClick={() => { setForm(EMPTY_FORM); setMessage(''); setError('') }}
            className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus size={15} />
            New
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
        {/* ── Sidebar list ── */}
        <aside className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">Products ({products.length})</p>
            <button onClick={loadProducts} title="Refresh">
              <RefreshCw size={14} className={`text-gray-400 hover:text-gray-700 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="max-h-[680px] overflow-y-auto p-2 space-y-1">
            {loading ? (
              <p className="p-4 text-sm text-gray-400">Loading…</p>
            ) : products.length === 0 ? (
              <p className="p-4 text-sm text-gray-400">No products yet. Add one or import CSV.</p>
            ) : (
              Object.entries(grouped).map(([catKey, catProducts]) => (
                <div key={catKey}>
                  <p className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    {catProducts[0]?.category_display_name ?? catKey}
                  </p>
                  {catProducts.map(p => {
                    const active = p.id === form.id
                    const mainImg = p.images?.[0]
                    return (
                      <button
                        key={p.id}
                        onClick={() => { setForm(productToForm(p)); setMessage(''); setError('') }}
                        className={`w-full rounded-xl p-2.5 text-left transition-colors ${active ? 'bg-ocg-navy' : 'hover:bg-gray-50'}`}
                      >
                        <div className="flex gap-2.5 items-center">
                          <div className={`h-10 w-10 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0 ${active ? 'bg-white/10' : 'bg-gray-100'}`}>
                            {mainImg ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={mainImg.startsWith('/') ? `${GLITZ_URL}${mainImg}` : mainImg}
                                alt="" className="h-full w-full object-cover"
                                onError={e => { e.currentTarget.style.display = 'none' }}
                              />
                            ) : (
                              <Package size={16} className={active ? 'text-white/40' : 'text-gray-300'} />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={`truncate text-xs font-semibold ${active ? 'text-white' : 'text-gray-900'}`}>
                              {p.name}{p.variant ? ` — ${p.variant}` : ''}
                            </p>
                            <p className={`text-[10px] mt-0.5 ${active ? 'text-white/50' : 'text-gray-400'}`}>
                              {p.sizes?.length ?? 0} size{p.sizes?.length !== 1 ? 's' : ''} · {p.is_active ? 'Active' : 'Hidden'}
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
              {form.id ? `Editing — ${form.name || 'product'}${form.variant ? ` (${form.variant})` : ''}` : 'New Product'}
            </p>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              {form.id && (
                <a href={`${GLITZ_URL}/products/${form.slug}`} target="_blank" rel="noreferrer"
                  className="text-ocg-navy hover:underline flex items-center gap-1">
                  <Eye size={12} /> Preview
                </a>
              )}
            </div>
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

            {/* Basic info */}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Basic Info</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <TextField label="Product name *" value={form.name} required onChange={v => update('name', v)} />
                <TextField label="Variant (e.g. Lavender)" value={form.variant} onChange={v => update('variant', v)} />
                <TextField label="Slug *" value={form.slug} required onChange={v => update('slug', v)} />
              </div>
            </div>

            {/* Category */}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Category</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <TextField label="Category slug" value={form.category} onChange={v => update('category', v)} />
                <TextField label="Display name" value={form.category_display_name} onChange={v => update('category_display_name', v)} />
                <Field label="Accent colour">
                  <div className="flex gap-2 items-center">
                    <input type="color" value={form.category_accent}
                      onChange={e => update('category_accent', e.target.value)}
                      className="h-9 w-12 rounded border border-gray-200 cursor-pointer p-0.5" />
                    <input type="text" value={form.category_accent}
                      onChange={e => update('category_accent', e.target.value)}
                      className={inputCls} placeholder="#0ea5e9" />
                  </div>
                </Field>
              </div>
            </div>

            {/* Sizes + Pricing */}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Sizes &amp; Pricing</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide w-1/2">Size</th>
                      <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide w-1/2">Price (Ksh)</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {form.sizes.map((s, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-2 pr-3">
                          <input
                            type="text"
                            value={s.label}
                            placeholder="e.g. 500ml"
                            onChange={e => updateSize(i, 'label', e.target.value)}
                            className={inputCls}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            type="number"
                            value={s.price_ksh}
                            min={0}
                            onChange={e => updateSize(i, 'price_ksh', e.target.value)}
                            className={inputCls}
                          />
                        </td>
                        <td className="py-2">
                          <button onClick={() => removeSize(i)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={addSize}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-ocg-navy hover:underline">
                <Plus size={13} /> Add size
              </button>
            </div>

            {/* Description + Usage */}
            <div className="grid gap-4 lg:grid-cols-2">
              <TextArea label="Description" value={form.description} onChange={v => update('description', v)} rows={4} />
              <TextArea label="Usage Instructions" value={form.usage_instructions} onChange={v => update('usage_instructions', v)} rows={4} />
            </div>

            {/* Features */}
            <TextArea label="Key Features — one per line" value={form.features} onChange={v => update('features', v)} rows={5} />

            {/* Images */}
            <div className="space-y-3">
              <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Images
              </span>

              {/* Upload dropzone */}
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4">
                <label className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 text-center ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
                  <Upload size={22} className="text-amber-500" />
                  <span className="text-sm font-semibold text-gray-900">
                    {uploading ? 'Uploading…' : 'Upload product images'}
                  </span>
                  <span className="text-xs text-gray-500">JPG, PNG or WebP · multiple allowed</span>
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

              {/* Draggable image grid */}
              {linesToArray(form.images).length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {linesToArray(form.images).map((url, i, arr) => (
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
                      <img
                        src={url.startsWith('/') ? `${GLITZ_URL}${url}` : url}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={e => { e.currentTarget.style.opacity = '0' }}
                      />
                      {/* Position badge */}
                      <span className="absolute top-1 left-1 bg-black/60 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                        {i + 1}
                      </span>
                      {/* Delete button */}
                      <button
                        type="button"
                        onClick={() => update('images', arr.filter((_, j) => j !== i).join('\n'))}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs leading-none"
                        aria-label="Remove image"
                      >
                        ×
                      </button>
                      {/* Main badge */}
                      {i === 0 && (
                        <span className="absolute bottom-1 left-1 right-1 bg-amber-500 text-white text-[9px] text-center rounded py-0.5 font-semibold">
                          MAIN
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Raw URL textarea — collapsed */}
              <details className="text-xs text-gray-400">
                <summary className="cursor-pointer select-none hover:text-gray-600 transition-colors py-1">
                  Edit URLs manually
                </summary>
                <textarea
                  value={form.images}
                  rows={4}
                  onChange={e => update('images', e.target.value)}
                  className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-ocg-navy font-mono"
                  placeholder={`/products/handwash-lavender.png\nhttps://storage.supabase.co/...`}
                />
              </details>
            </div>

            {/* Toggles */}
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField label="Sort order" type="number" value={form.sort_order} onChange={v => update('sort_order', v)} />
              <div className="flex flex-col gap-2 pt-5">
                {([ ['is_active', 'Active on site'] , ['is_featured', 'Featured'], ['is_in_stock', 'In stock'] ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={form[key]} onChange={e => update(key, e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-ocg-navy" />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* Save */}
            <div className="flex justify-end border-t border-gray-100 pt-5">
              <button
                onClick={saveProduct}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
              >
                <Save size={16} />
                {saving ? 'Saving…' : 'Save Product'}
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
{`slug, name, variant, category, category_display_name, category_accent,
description, usage_instructions, features, sizes, images,
is_active, is_featured, is_in_stock, sort_order`}
          </code>
          <ul className="space-y-1 mt-2">
            <li><strong>sizes</strong> — pipe-separated <code>label:price</code> pairs, e.g. <code>500ml:100|5ltrs:400|20ltrs:1500</code></li>
            <li><strong>features</strong> — pipe-separated list, e.g. <code>Kills germs|pH balanced|Moisturising</code></li>
            <li><strong>images</strong> — pipe-separated URLs, e.g. <code>/products/img.png|https://cdn.example.com/img2.jpg</code></li>
            <li>Rows are <strong>upserted</strong> on <code>slug</code> — existing products are updated, new slugs are inserted.</li>
          </ul>
        </div>
      </details>
    </div>
  )
}

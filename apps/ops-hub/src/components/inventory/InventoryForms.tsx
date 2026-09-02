'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, PackagePlus } from 'lucide-react'
import { api } from '@/lib/apiClient'

type ItemOption = { id: string; label: string; unit: string; quantity: number; itemType: string; packSize: number }

const ITEM_TYPE_OPTIONS = [
  { value: 'consumable', label: 'Consumable / general' },
  { value: 'raw_material', label: 'Raw material' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'work_in_progress', label: 'Work in progress' },
  { value: 'finished_good', label: 'Finished good' },
  { value: 'sample', label: 'Sample' },
]

/** Item-master registration only. Stock is created by authoritative posted
 * documents (or an approved stock-take adjustment), never from this form. */
export function InventoryForms({ brandId, categories = [] }: {
  brandId: string
  items: ItemOption[]
  categories?: string[]
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [values, setValues] = useState<Record<string, string>>({ unit: 'pcs', item_type: 'consumable' })
  const set = (name: string, value: string) => setValues((current) => ({ ...current, [name]: value }))

  async function submit() {
    setError(''); setSuccess('')
    if (!values.name?.trim()) { setError('Item name is required.'); return }
    setSaving(true)
    const { ok, data } = await api<{ error?: string }>('/api/inventory', {
      method: 'POST',
      body: JSON.stringify({ action: 'item', values: { ...values, brand_id: brandId } }),
    })
    setSaving(false)
    if (!ok) { setError(data?.error ?? 'Failed to save.'); return }
    setSuccess('Item added with a zero balance. Receive or issue stock through the relevant operational document.')
    setValues({ unit: values.unit ?? 'pcs', item_type: values.item_type ?? 'consumable' })
    router.refresh()
  }

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <span className="rounded-lg bg-ocg-navy/5 p-2 text-ocg-navy"><PackagePlus size={16} /></span>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Register inventory item</h2>
          <p className="mt-1 text-sm text-gray-500">Creates the item master at zero stock. GRNs, GINs, GTNs, delivery/return notes and approved stock takes are the only stock entry points.</p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        <Field label="Item name *"><input className="input" value={values.name ?? ''} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="SKU / code"><input className="input" value={values.sku ?? ''} onChange={(e) => set('sku', e.target.value)} /></Field>
        <Field label="Item type">
          <select className="input" value={values.item_type ?? 'consumable'} onChange={(e) => set('item_type', e.target.value)}>
            {ITEM_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Category">
          {categories.length > 0 ? (
            <select className="input" value={values.category ?? ''} onChange={(e) => set('category', e.target.value)}>
              <option value="">Choose category</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          ) : <input className="input" value={values.category ?? ''} onChange={(e) => set('category', e.target.value)} />}
        </Field>
        <Field label="Base unit">
          <select className="input" value={values.unit ?? 'pcs'} onChange={(e) => set('unit', e.target.value)}>
            {['pcs', 'sets', 'boxes', 'kg', 'litres', 'ml', 'reams', 'packets'].map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Field>
        <Field label="Reference cost (KSh)"><input type="number" min="0" step="0.01" className="input" value={values.unit_value_ksh ?? ''} onChange={(e) => set('unit_value_ksh', e.target.value)} /></Field>
        <Field label="Retail price (KSh)"><input type="number" min="0" step="0.01" className="input" value={values.selling_price_ksh ?? ''} onChange={(e) => set('selling_price_ksh', e.target.value)} /></Field>
        <Field label="Wholesale price (KSh)"><input type="number" min="0" step="0.01" className="input" value={values.wholesale_price_ksh ?? ''} onChange={(e) => set('wholesale_price_ksh', e.target.value)} /></Field>
        <Field label="Reorder level"><input type="number" min="0" step="0.01" className="input" value={values.reorder_level ?? ''} onChange={(e) => set('reorder_level', e.target.value)} /></Field>
        <Field label="Location"><input className="input" value={values.location ?? ''} onChange={(e) => set('location', e.target.value)} /></Field>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 size={15} /> {success}</p>}
      <div className="mt-4 flex justify-end">
        <button onClick={submit} disabled={saving} className="rounded-lg bg-ocg-navy px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
          {saving ? 'Saving…' : 'Register item'}
        </button>
      </div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>{children}</label>
}

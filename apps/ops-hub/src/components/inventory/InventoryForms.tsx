'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2, PackagePlus } from 'lucide-react'
import { api } from '@/lib/apiClient'
import { finishedGoodsOptionLabel } from '@/lib/finishedGoodsQuantity'

type ItemOption = { id: string; label: string; unit: string; quantity: number; itemType: string; packSize: number }
type Mode = 'in' | 'out' | 'item'

const ITEM_TYPE_OPTIONS = [
  { value: 'consumable', label: 'Consumable / general' },
  { value: 'raw_material', label: 'Raw material' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'work_in_progress', label: 'Work in progress' },
  { value: 'finished_good', label: 'Finished good' },
  { value: 'sample', label: 'Sample' },
]

/**
 * Brand inventory actions: stock-in and stock-out forms (the tracked ways
 * goods enter and leave), plus new-item registration with opening stock.
 * `categories` carries the department's classification presets (e.g. Glitz:
 * Raw Material / Packaging / WIP / Finished Goods / Others).
 */
export function InventoryForms({ brandId, items, categories = [] }: { brandId: string; items: ItemOption[]; categories?: string[] }) {
  const router = useRouter()
  const today = new Date().toISOString().slice(0, 10)
  const [mode, setMode] = useState<Mode>('in')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [values, setValues] = useState<Record<string, string>>({ movement_date: today, unit: 'pcs' })

  function set(name: string, value: string) {
    setValues((current) => ({ ...current, [name]: value }))
  }
  function switchMode(m: Mode) {
    setMode(m); setError(''); setSuccess('')
  }

  async function submit() {
    setError(''); setSuccess('')
    if (mode === 'item') {
      if (!values.name?.trim()) { setError('Item name is required.'); return }
    } else {
      if (!values.item_id) { setError('Choose the item.'); return }
      if (!values.quantity || Number(values.quantity) <= 0) { setError('Enter a quantity greater than 0.'); return }
      if (mode === 'out' && !values.reason?.trim()) { setError('Enter the reason stock is going out.'); return }
    }
    setSaving(true)
    const payload = mode === 'item'
      ? { action: 'item', values: { ...values, brand_id: brandId } }
      : { action: 'movement', values: { ...values, direction: mode } }
    const { ok, data } = await api<{ error?: string; item?: { quantity: number; unit: string } }>('/api/inventory', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!ok) { setError(data?.error ?? 'Failed to save.'); return }
    setSuccess(
      mode === 'item'
        ? 'Item added to the register.'
        : data.item
        ? `Recorded. New stock level: ${Number(data.item.quantity).toLocaleString()} ${data.item.unit}.`
        : 'Recorded.',
    )
    setValues({ movement_date: today, unit: values.unit ?? 'pcs', item_id: values.item_id ?? '' })
    router.refresh()
  }

  const tabs: { key: Mode; label: string; icon: React.ElementType }[] = [
    { key: 'in', label: 'Stock in', icon: ArrowDownToLine },
    { key: 'out', label: 'Stock out', icon: ArrowUpFromLine },
    { key: 'item', label: 'New item', icon: PackagePlus },
  ]

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Inventory actions</h2>
          <p className="mt-1 text-sm text-gray-500">Every unit in or out is recorded against the register with the stock level after.</p>
        </div>
        <div className="flex rounded-lg border border-gray-200 p-1">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => switchMode(key)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                mode === key
                  ? key === 'in' ? 'bg-emerald-600 text-white' : key === 'out' ? 'bg-red-600 text-white' : 'bg-ocg-navy text-white'
                  : 'text-gray-500 hover:text-gray-800'
              }`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      {mode !== 'item' ? (
        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="Item *">
            <select className="input" value={values.item_id ?? ''} onChange={(e) => set('item_id', e.target.value)}>
              <option value="">Choose item</option>
              {items.map((i) => <option key={i.id} value={i.id}>
                {i.label} — {i.itemType === 'finished_good' ? finishedGoodsOptionLabel(i.quantity, i.packSize) : `${i.quantity.toLocaleString()} ${i.unit}`} in stock
              </option>)}
            </select>
          </Field>
          <Field label="Quantity *"><input type="number" min="0" step="0.01" className="input" value={values.quantity ?? ''} onChange={(e) => set('quantity', e.target.value)} /></Field>
          <Field label="Date *"><input type="date" className="input" value={values.movement_date ?? ''} onChange={(e) => set('movement_date', e.target.value)} /></Field>
          <Field label="Reference"><input className="input" placeholder="Delivery note, requisition…" value={values.reference ?? ''} onChange={(e) => set('reference', e.target.value)} /></Field>
          {mode === 'in' && (
            <Field label="Unit value (KSh)"><input type="number" min="0" step="0.01" className="input" placeholder="Updates item valuation" value={values.unit_value_ksh ?? ''} onChange={(e) => set('unit_value_ksh', e.target.value)} /></Field>
          )}
          <Field label={mode === 'in' ? 'Source / reason' : 'Reason / issued to *'} className={mode === 'in' ? 'lg:col-span-3' : 'lg:col-span-4'}>
            <input className="input" placeholder={mode === 'in' ? 'Donation, transfer in, purchase…' : 'Used for class supplies, issued to Fatma…'} value={values.reason ?? ''} onChange={(e) => set('reason', e.target.value)} />
          </Field>
        </div>
      ) : (
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
            ) : (
              <input className="input" placeholder="Furniture, Learning materials…" value={values.category ?? ''} onChange={(e) => set('category', e.target.value)} />
            )}
          </Field>
          <Field label="Unit">
            <select className="input" value={values.unit ?? 'pcs'} onChange={(e) => set('unit', e.target.value)}>
              {['pcs', 'sets', 'boxes', 'kg', 'litres', 'reams', 'packets'].map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="Opening quantity"><input type="number" min="0" step="0.01" className="input" value={values.quantity ?? ''} onChange={(e) => set('quantity', e.target.value)} /></Field>
          <Field label="Unit value (KSh)"><input type="number" min="0" step="0.01" className="input" value={values.unit_value_ksh ?? ''} onChange={(e) => set('unit_value_ksh', e.target.value)} /></Field>
          <Field label="Reorder level"><input type="number" min="0" step="0.01" className="input" value={values.reorder_level ?? ''} onChange={(e) => set('reorder_level', e.target.value)} /></Field>
          <Field label="Location"><input className="input" placeholder="Store, Classroom 2…" value={values.location ?? ''} onChange={(e) => set('location', e.target.value)} /></Field>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 size={15} /> {success}</p>}
      <div className="mt-4 flex justify-end">
        <button onClick={submit} disabled={saving}
          className={`rounded-lg px-5 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
            mode === 'in' ? 'bg-emerald-600 hover:bg-emerald-700' : mode === 'out' ? 'bg-red-600 hover:bg-red-700' : 'bg-ocg-navy hover:bg-slate-800'
          }`}>
          {saving ? 'Saving…' : mode === 'in' ? 'Record stock in' : mode === 'out' ? 'Record stock out' : 'Add item'}
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

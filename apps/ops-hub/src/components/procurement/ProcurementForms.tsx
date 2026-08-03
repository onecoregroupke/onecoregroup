'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, CheckCircle2, Contact, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { api } from '@/lib/apiClient'
import { procurementCategories } from '@/lib/brandCategories'
import { PROCUREMENT_ITEM_TYPES, PROCUREMENT_SCOPES, COST_CENTRES, defaultDisposition } from '@/lib/procurementModel'

type BrandOption = { id: string; label: string; slug: string }
type VendorOption = { id: string; label: string; blacklisted: boolean; blacklistReason?: string }
type ItemOption = { id: string; brandId: string; label: string }
type Line = { description: string; quantity: string; unit: string; unit_cost_ksh: string; inventory_item_id: string; item_type: string; disposition: string }

const EMPTY_LINE: Line = { description: '', quantity: '1', unit: 'pcs', unit_cost_ksh: '', inventory_item_id: '', item_type: 'stocked_inventory', disposition: 'stock' }

/**
 * Purchase and vendor capture. A purchase records how goods were acquired
 * (vendor, brand, reference, receipt link) with line items; on "receive" the
 * lines enter the brand's inventory — linked lines top up existing items,
 * unlinked lines create new ones.
 */
export function ProcurementForms({
  brands,
  vendors,
  inventoryItems,
}: {
  brands: BrandOption[]
  vendors: VendorOption[]
  inventoryItems: ItemOption[]
}) {
  const router = useRouter()
  const today = new Date().toISOString().slice(0, 10)
  const [mode, setMode] = useState<'purchase' | 'vendor'>('purchase')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [purchase, setPurchase] = useState<Record<string, string>>({
    brand_id: brands.length === 1 ? brands[0].id : '',
    purchase_date: today,
    payment_status: 'unpaid',
  })
  const [lines, setLines] = useState<Line[]>([{ ...EMPTY_LINE }])
  const [vendor, setVendor] = useState<Record<string, string>>({})

  const brandItems = useMemo(
    () => inventoryItems.filter((i) => !purchase.brand_id || i.brandId === purchase.brand_id),
    [inventoryItems, purchase.brand_id],
  )
  const total = lines.reduce((sum, l) => sum + Number(l.quantity || 0) * Number(l.unit_cost_ksh || 0), 0)
  const categories = useMemo(
    () => procurementCategories(brands.find((b) => b.id === purchase.brand_id)?.slug),
    [brands, purchase.brand_id],
  )
  const selectedVendor = vendors.find((v) => v.id === purchase.vendor_id)

  function setP(name: string, value: string) {
    setPurchase((c) => ({ ...c, [name]: value }))
  }
  function setLine(index: number, patch: Partial<Line>) {
    setLines((c) => c.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  async function submit() {
    setError(''); setSuccess('')
    setSaving(true)
    let payload: Record<string, unknown>
    if (mode === 'vendor') {
      if (!vendor.name?.trim()) { setError('Vendor name is required.'); setSaving(false); return }
      payload = { action: 'vendor', values: vendor }
    } else {
      if (!purchase.brand_id) { setError('Choose the brand.'); setSaving(false); return }
      const validLines = lines.filter((l) => l.description.trim())
      if (validLines.length === 0) { setError('Add at least one line item.'); setSaving(false); return }
      payload = { action: 'purchase', values: { ...purchase, items: validLines } }
    }
    const { ok, data } = await api<{ error?: string }>('/api/procurement', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!ok) { setError(data?.error ?? 'Failed to save.'); return }
    setSuccess(mode === 'vendor' ? 'Vendor registered.' : 'Purchase recorded. Use "Receive" when the goods arrive.')
    if (mode === 'vendor') setVendor({})
    else { setPurchase({ brand_id: purchase.brand_id, purchase_date: today, payment_status: 'unpaid' }); setLines([{ ...EMPTY_LINE }]) }
    router.refresh()
  }

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Procurement actions</h2>
          <p className="mt-1 text-sm text-gray-500">Record purchases with their receipts, or register a new vendor.</p>
        </div>
        <div className="flex rounded-lg border border-gray-200 p-1">
          <button onClick={() => { setMode('purchase'); setError(''); setSuccess('') }}
            className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold ${mode === 'purchase' ? 'bg-ocg-navy text-white' : 'text-gray-500 hover:text-gray-800'}`}>
            <ShoppingCart size={14} /> Purchase
          </button>
          <button onClick={() => { setMode('vendor'); setError(''); setSuccess('') }}
            className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold ${mode === 'vendor' ? 'bg-ocg-navy text-white' : 'text-gray-500 hover:text-gray-800'}`}>
            <Contact size={14} /> Vendor
          </button>
        </div>
      </div>

      {mode === 'purchase' ? (
        <>
          <div className="grid gap-3 lg:grid-cols-4">
            <Field label="Brand *">
              <select className="input" value={purchase.brand_id ?? ''} onChange={(e) => setP('brand_id', e.target.value)}>
                {brands.length !== 1 && <option value="">Choose brand</option>}
                {brands.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
            </Field>
            <Field label="Vendor">
              <select className="input" value={purchase.vendor_id ?? ''} onChange={(e) => setP('vendor_id', e.target.value)}>
                <option value="">Choose vendor</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id} disabled={v.blacklisted}>
                    {v.blacklisted ? `🚫 ${v.label} — BLACKLISTED` : v.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Category">
              <select className="input" value={purchase.category ?? ''} onChange={(e) => setP('category', e.target.value)}>
                <option value="">Choose category</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Date *"><input type="date" className="input" value={purchase.purchase_date ?? ''} onChange={(e) => setP('purchase_date', e.target.value)} /></Field>
            <Field label="Reference"><input className="input" placeholder="LPO no, invoice, M-Pesa code…" value={purchase.reference ?? ''} onChange={(e) => setP('reference', e.target.value)} /></Field>
            <Field label="Receipt link"><input className="input" placeholder="Drive / photo URL of the receipt" value={purchase.receipt_url ?? ''} onChange={(e) => setP('receipt_url', e.target.value)} /></Field>
            <Field label="Payment status">
              <select className="input" value={purchase.payment_status ?? 'unpaid'} onChange={(e) => setP('payment_status', e.target.value)}>
                <option value="unpaid">Unpaid</option>
                <option value="partial">Partially paid</option>
                <option value="paid">Paid</option>
              </select>
            </Field>
            <Field label="Scope">
              <select className="input" value={purchase.scope ?? 'brand'} onChange={(e) => setP('scope', e.target.value)}>
                {PROCUREMENT_SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Cost centre">
              <select className="input" value={purchase.cost_centre ?? ''} onChange={(e) => setP('cost_centre', e.target.value)}>
                <option value="">—</option>
                {COST_CENTRES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Notes" className="lg:col-span-2"><input className="input" value={purchase.notes ?? ''} onChange={(e) => setP('notes', e.target.value)} /></Field>
          </div>

          {selectedVendor?.blacklisted && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <Ban size={15} className="mt-0.5 shrink-0" />
              <span>
                <b>{selectedVendor.label} is blacklisted</b>
                {selectedVendor.blacklistReason ? ` — ${selectedVendor.blacklistReason}` : ''}. New purchases
                against this vendor are blocked; restore them from the vendor register first.
              </span>
            </p>
          )}

          <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Line items</p>
          <p className="mb-2 text-xs text-gray-400">For each item choose whether it will be <b>stored &amp; issued later</b> (enters inventory) or was <b>consumed now</b> (expensed, no stock).</p>
          <div className="space-y-2">
            {lines.map((line, i) => {
              const stocked = line.disposition === 'stock'
              return (
              <div key={i} className="grid gap-2 rounded-lg bg-gray-50 p-2.5 lg:grid-cols-[minmax(0,1.6fr)_0.7fr_0.8fr_0.9fr_minmax(0,1.4fr)_minmax(0,1.1fr)_auto]">
                <input className="input" placeholder="Description *" value={line.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                <input type="number" min="0" step="0.01" className="input" placeholder="Qty" value={line.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                <select className="input" value={line.unit} onChange={(e) => setLine(i, { unit: e.target.value })}>
                  {['pcs', 'sets', 'boxes', 'kg', 'litres', 'reams', 'packets'].map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <input type="number" min="0" step="0.01" className="input" placeholder="Unit cost" value={line.unit_cost_ksh} onChange={(e) => setLine(i, { unit_cost_ksh: e.target.value })} />
                <select className="input" value={line.item_type} onChange={(e) => setLine(i, { item_type: e.target.value, disposition: defaultDisposition(e.target.value) })}>
                  {PROCUREMENT_ITEM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <select className="input" value={line.disposition} onChange={(e) => setLine(i, { disposition: e.target.value })}>
                  <option value="stock">Store (inventory)</option>
                  <option value="consume">Consumed now</option>
                </select>
                <button type="button" onClick={() => setLines((c) => c.filter((_, idx) => idx !== i))} disabled={lines.length === 1}
                  className="flex items-center justify-center rounded-lg border border-gray-200 px-2 text-gray-400 hover:text-red-500 disabled:opacity-30">
                  <Trash2 size={14} />
                </button>
                {stocked && (
                  <select className="input lg:col-span-6" value={line.inventory_item_id} onChange={(e) => setLine(i, { inventory_item_id: e.target.value })}>
                    <option value="">New inventory item on receive</option>
                    {brandItems.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                )}
              </div>
            )})}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <button type="button" onClick={() => setLines((c) => [...c, { ...EMPTY_LINE }])}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-ocg-gold hover:text-ocg-gold">
              <Plus size={13} /> Add line
            </button>
            <p className="text-sm font-medium text-gray-700">Total: KSh {total.toLocaleString()}</p>
          </div>
        </>
      ) : (
        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="Vendor name *"><input className="input" value={vendor.name ?? ''} onChange={(e) => setVendor((c) => ({ ...c, name: e.target.value }))} /></Field>
          <Field label="Contact person"><input className="input" value={vendor.contact_person ?? ''} onChange={(e) => setVendor((c) => ({ ...c, contact_person: e.target.value }))} /></Field>
          <Field label="Phone"><input className="input" value={vendor.phone ?? ''} onChange={(e) => setVendor((c) => ({ ...c, phone: e.target.value }))} /></Field>
          <Field label="Email"><input className="input" value={vendor.email ?? ''} onChange={(e) => setVendor((c) => ({ ...c, email: e.target.value }))} /></Field>
          <Field label="Primary brand">
            <select className="input" value={vendor.brand_id ?? ''} onChange={(e) => setVendor((c) => ({ ...c, brand_id: e.target.value }))}>
              <option value="">Group-wide</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
          </Field>
          <Field label="Payment terms"><input className="input" placeholder="Cash on delivery, 30 days…" value={vendor.payment_terms ?? ''} onChange={(e) => setVendor((c) => ({ ...c, payment_terms: e.target.value }))} /></Field>
          <Field label="Notes" className="lg:col-span-2"><input className="input" value={vendor.notes ?? ''} onChange={(e) => setVendor((c) => ({ ...c, notes: e.target.value }))} /></Field>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 size={15} /> {success}</p>}
      <div className="mt-4 flex justify-end">
        <button onClick={submit} disabled={saving}
          className="rounded-lg bg-ocg-navy px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
          {saving ? 'Saving…' : mode === 'purchase' ? 'Record purchase' : 'Register vendor'}
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

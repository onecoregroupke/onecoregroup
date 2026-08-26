'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Receipt } from 'lucide-react'
import { api } from '@/lib/apiClient'
import { inventoryOptionStockLabel } from '@/lib/finishedGoodsQuantity'
import { Pad, PadHeader, PadField, PadLines, PadRow, PadCell, StockEffectNotice } from './PadForm'
import type { ItemOption, Identity } from './GoodsReceivedNoteForm'

export interface CustomerOption {
  id: string
  label: string
  creditApproved: boolean
  termsDays: number
}

interface Line {
  item_id: string
  item_code: string
  description: string
  /** The pad's UNIT column — pack count, e.g. "8PC". */
  pad_unit_text: string
  /** The pad's QTY column — pack size, e.g. "1ltr". */
  pad_qty_text: string
  /** The real numeric quantity. This is what moves stock. */
  quantity: string
  rate_ksh: string
  batch_number: string
}

const blankLine = (): Line => ({
  item_id: '', item_code: '', description: '',
  pad_unit_text: '', pad_qty_text: '', quantity: '', rate_ksh: '', batch_number: '',
})

const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * SALES INVOICE — the pad prints:
 * M/s · Date · Invoice No · [CODE | DESCRIPTION | UNIT | QTY | RATE | AMOUNT | VAT] ·
 * AMOUNT · VAT · TOTAL
 *
 * TWO DECISIONS ARE VISIBLE HERE.
 *
 * 1. VAT is INCLUSIVE, back-computed at 16%, reproducing the pad exactly.
 *    Invoice 1261 reads AMOUNT 2568.97 + VAT 411.03 = TOTAL 2980.00, and
 *    2980 × 16/116 = 411.03 to the cent. The rate you type is what the customer
 *    pays; the split is derived.
 *
 * 2. UNIT and QTY are inverted on the pad — UNIT holds the pack count ("8PC"),
 *    QTY holds the pack size ("1ltr"). Both are captured verbatim for printing,
 *    alongside a real numeric quantity that arithmetic and the stock ledger can
 *    actually use. The paper stays recognisable; the data stays computable.
 */
export function SalesInvoiceForm({
  brands, items, customers, identity, defaultBrandId, suggestedNumber,
}: {
  brands: { id: string; label: string }[]
  items: ItemOption[]
  customers: CustomerOption[]
  identity: Identity | null
  defaultBrandId: string
  suggestedNumber: string
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [head, setHead] = useState({
    brand_id: defaultBrandId,
    invoice_number: suggestedNumber,
    invoice_date: new Date().toISOString().slice(0, 10),
    customer_id: '',
    bill_to_name: '',
    sale_type: 'cash' as 'cash' | 'credit',
    lpo_number: '',
    delivery_note_no: '',
    due_date: '',
    notes: '',
  })
  const [vatRate, setVatRate] = useState('16')
  const [inclusive, setInclusive] = useState(true)
  const [lines, setLines] = useState<Line[]>([blankLine()])

  const set = <K extends keyof typeof head>(k: K, v: (typeof head)[K]) => setHead((c) => ({ ...c, [k]: v }))
  const setLine = (idx: number, patch: Partial<Line>) =>
    setLines((c) => c.map((l, i) => (i === idx ? { ...l, ...patch } : l)))

  const r = Number(vatRate || 0)
  /** The same arithmetic the database GENERATED columns perform. */
  function amounts(l: Line) {
    const gross = Number(l.quantity || 0) * Number(l.rate_ksh || 0)
    if (inclusive) {
      const vat = Math.round((gross * r / (100 + r)) * 100) / 100
      const net = Math.round((gross * 100 / (100 + r)) * 100) / 100
      return { net, vat, total: Math.round(gross * 100) / 100 }
    }
    const net = Math.round(gross * 100) / 100
    const vat = Math.round((gross * r / 100) * 100) / 100
    return { net, vat, total: Math.round((net + vat) * 100) / 100 }
  }

  const totals = lines.reduce(
    (acc, l) => {
      const a = amounts(l)
      return { net: acc.net + a.net, vat: acc.vat + a.vat, total: acc.total + a.total }
    },
    { net: 0, vat: 0, total: 0 },
  )
  const stockOut = lines.filter((l) => l.item_id).reduce((s, l) => s + Number(l.quantity || 0), 0)
  const customer = customers.find((c) => c.id === head.customer_id)

  async function submit(post: boolean) {
    setError(''); setDone('')
    const usable = lines.filter((l) => l.description.trim() && Number(l.quantity) > 0)
    if (usable.length === 0) { setError('Add at least one line with a description and quantity.'); return }
    if (head.sale_type === 'credit' && !head.customer_id) {
      setError('A credit sale must name the customer being given credit.'); return
    }

    setSaving(true)
    const { ok, data } = await api<{ error?: string; row?: { id: string; invoice_ref: string; invoice_number: string } }>('/api/sales', {
      method: 'POST',
      body: JSON.stringify({
        action: 'create-invoice',
        ...head,
        customer_id: head.customer_id || null,
        due_date: head.due_date || null,
        vat_rate_percent: r,
        prices_include_vat: inclusive,
        lines: usable.map((l) => ({
          item_id: l.item_id || null,
          item_code: l.item_code,
          description: l.description,
          pad_unit_text: l.pad_unit_text,
          pad_qty_text: l.pad_qty_text,
          quantity: Number(l.quantity),
          rate_ksh: Number(l.rate_ksh || 0),
          batch_number: l.batch_number,
        })),
      }),
    })
    if (!ok) { setSaving(false); setError(data?.error ?? 'Could not save the invoice.'); return }

    const row = data.row
    if (post && row?.id) {
      const posted = await api<{ error?: string }>('/api/sales', {
        method: 'POST',
        body: JSON.stringify({ action: 'post-invoice', id: row.id }),
      })
      setSaving(false)
      if (!posted.ok) { setError(posted.data?.error ?? 'Saved as draft, but posting to stock failed.'); return }
      setDone(`Invoice ${row.invoice_number || row.invoice_ref} issued — ${stockOut} unit(s) removed from stock.`)
    } else {
      setSaving(false)
      setDone(`Invoice ${row?.invoice_number || row?.invoice_ref} saved as a draft. Stock has NOT moved yet.`)
    }
    setLines([blankLine()])
    router.refresh()
  }

  return (
    <Pad title="Invoice" identity={identity} subtitle="Sale to a customer">
      <PadHeader>
        {brands.length > 1 && (
          <PadField label="Brand">
            <select className="input" value={head.brand_id} onChange={(e) => set('brand_id', e.target.value)}>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
          </PadField>
        )}
        <PadField label="M/s (bill to)">
          <input className="input" value={head.bill_to_name} onChange={(e) => set('bill_to_name', e.target.value)}
            placeholder="As written on the invoice" />
        </PadField>
        <PadField label="Customer account">
          <select className="input" value={head.customer_id}
            onChange={(e) => {
              const c = customers.find((x) => x.id === e.target.value)
              set('customer_id', e.target.value)
              if (c && !head.bill_to_name) set('bill_to_name', c.label)
            }}>
            <option value="">Walk-in / cash</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.label}{c.creditApproved ? ` · ${c.termsDays}d terms` : ''}</option>
            ))}
          </select>
        </PadField>
        <PadField label="Date">
          <input type="date" className="input" value={head.invoice_date} onChange={(e) => set('invoice_date', e.target.value)} />
        </PadField>
        <PadField label="Invoice no.">
          <input className="input" value={head.invoice_number} onChange={(e) => set('invoice_number', e.target.value)}
            placeholder="Number on the pad" />
        </PadField>
        <PadField label="Sale type">
          <select className="input" value={head.sale_type}
            onChange={(e) => set('sale_type', e.target.value as 'cash' | 'credit')}>
            <option value="cash">Cash</option>
            <option value="credit">On account (credit)</option>
          </select>
        </PadField>
        {head.sale_type === 'credit' && (
          <PadField label="Due date">
            <input type="date" className="input" value={head.due_date} onChange={(e) => set('due_date', e.target.value)} />
          </PadField>
        )}
        <PadField label="L.P.O. no.">
          <input className="input" value={head.lpo_number} onChange={(e) => set('lpo_number', e.target.value)} />
        </PadField>
      </PadHeader>

      {head.sale_type === 'credit' && customer && !customer.creditApproved && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <strong>{customer.label}</strong> has no approved credit account. Raise an Account Opening
          Application and have it verified and approved before selling on credit.
        </p>
      )}

      <PadLines
        rows={lines.length}
        onAdd={() => setLines((c) => [...c, blankLine()])}
        columns={[
          { label: 'Code', width: '9%' },
          { label: 'Description' },
          { label: 'Unit', width: '8%' },
          { label: 'Qty', width: '8%' },
          { label: 'No.', width: '8%', align: 'right' },
          { label: 'Rate', width: '10%', align: 'right' },
          { label: 'Amount', width: '11%', align: 'right' },
          { label: 'VAT', width: '10%', align: 'right' },
        ]}
      >
        {lines.map((l, idx) => {
          const a = amounts(l)
          return (
            <PadRow key={idx} onRemove={lines.length > 1 ? () => setLines((c) => c.filter((_, i) => i !== idx)) : undefined}>
              <PadCell>
                <input className="input" value={l.item_code} onChange={(e) => setLine(idx, { item_code: e.target.value })} />
              </PadCell>
              <PadCell>
                <div className="flex gap-1">
                  <input className="input" value={l.description} placeholder="Description"
                    onChange={(e) => setLine(idx, { description: e.target.value })} />
                  <select className="input w-32 shrink-0" value={l.item_id}
                    onChange={(e) => {
                      const item = items.find((i) => i.id === e.target.value)
                      setLine(idx, {
                        item_id: e.target.value,
                        description: l.description || (item?.label ?? ''),
                      })
                    }}>
                    <option value="">No stock</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>{i.label}{i.onHand != null ? ` · ${inventoryOptionStockLabel(i)}` : ''}</option>
                    ))}
                  </select>
                </div>
              </PadCell>
              <PadCell>
                <input className="input" value={l.pad_unit_text} placeholder="8PC"
                  onChange={(e) => setLine(idx, { pad_unit_text: e.target.value })} />
              </PadCell>
              <PadCell>
                <input className="input" value={l.pad_qty_text} placeholder="1ltr"
                  onChange={(e) => setLine(idx, { pad_qty_text: e.target.value })} />
              </PadCell>
              <PadCell align="right">
                <input type="number" step="any" min="0" className="input text-right" value={l.quantity} placeholder="0"
                  onChange={(e) => setLine(idx, { quantity: e.target.value })} />
              </PadCell>
              <PadCell align="right">
                <input type="number" step="any" min="0" className="input text-right" value={l.rate_ksh}
                  onChange={(e) => setLine(idx, { rate_ksh: e.target.value })} />
              </PadCell>
              <PadCell align="right"><span className="px-1 text-sm tabular-nums text-gray-700">{money(a.net)}</span></PadCell>
              <PadCell align="right"><span className="px-1 text-sm tabular-nums text-gray-500">{money(a.vat)}</span></PadCell>
            </PadRow>
          )
        })}
      </PadLines>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <PadField label="VAT rate %">
            <input type="number" step="any" min="0" className="input w-24" value={vatRate} onChange={(e) => setVatRate(e.target.value)} />
          </PadField>
          <label className="mb-2 flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={inclusive} onChange={(e) => setInclusive(e.target.checked)} className="h-4 w-4 accent-[#1a1a2e]" />
            Rates include VAT (matches the pad)
          </label>
        </div>
        <div className="ml-auto w-full max-w-xs space-y-1 border-t-2 border-gray-800 pt-2 text-sm">
          <div className="flex justify-between"><span className="font-bold uppercase tracking-wider text-gray-600">Amount</span><span className="tabular-nums">{money(totals.net)}</span></div>
          <div className="flex justify-between"><span className="font-bold uppercase tracking-wider text-gray-600">VAT</span><span className="tabular-nums">{money(totals.vat)}</span></div>
          <div className="flex justify-between border-t border-gray-300 pt-1 text-base font-bold"><span className="uppercase tracking-wider">Total</span><span className="tabular-nums">{money(totals.total)}</span></div>
        </div>
      </div>

      <StockEffectNotice tone={stockOut > 0 ? 'out' : 'none'}>
        {stockOut > 0
          ? <>Issuing this invoice removes <strong>{stockOut}</strong> unit(s) of finished goods from stock. Lines with no linked item move nothing — they are recorded as sold but not tracked in inventory.</>
          : <>No line is linked to a stocked item, so issuing this invoice will move no stock. Link a line to an item if it should come off the shelf.</>}
      </StockEffectNotice>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      {done && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{done}</p>}

      <div className="flex flex-wrap gap-2">
        <button onClick={() => submit(true)} disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
          <Receipt size={15} /> {saving ? 'Saving…' : 'Issue invoice & release stock'}
        </button>
        <button onClick={() => submit(false)} disabled={saving}
          className="rounded-lg border border-gray-200 bg-white px-5 py-2 text-sm text-gray-600 hover:border-gray-300 disabled:opacity-60">
          Save as draft
        </button>
      </div>
    </Pad>
  )
}

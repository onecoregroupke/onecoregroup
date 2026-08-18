'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Truck } from 'lucide-react'
import { api } from '@/lib/apiClient'
import { Pad, PadHeader, PadField, PadLines, PadRow, PadCell, PadFooter, StockEffectNotice } from './PadForm'
import type { ItemOption, Identity } from './GoodsReceivedNoteForm'

interface Line {
  item_id: string
  quantity_issued: string
  unit: string
  selling_price_ksh: string
  batch_number: string
}

const blankLine = (): Line => ({ item_id: '', quantity_issued: '', unit: 'pcs', selling_price_ksh: '', batch_number: '' })

/** Monday of the week containing `d`. */
function weekStart(d: string): string {
  const date = new Date(`${d}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  return date.toISOString().slice(0, 10)
}
function addDays(d: string, n: number): string {
  const date = new Date(`${d}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + n)
  return date.toISOString().slice(0, 10)
}

/**
 * WEEKLY DELIVERY NOTE — stock handed to a sales team.
 *
 * This is the document that opens custody. Issuing it does TWO things, once
 * each: it deducts the main store, and it opens the salesperson's custody
 * balance. Daily sales then reduce custody ONLY.
 *
 * That is the whole point of the two-ledger design. Allocate 500 and sell 300,
 * and the main store must be down 500 — not 800. Deducting the store again at
 * the point of sale is the single most expensive mistake this module prevents.
 */
export function DeliveryNoteForm({
  brands, items, salespeople, stores, identity, defaultBrandId, suggestedNumber,
}: {
  brands: { id: string; label: string }[]
  items: ItemOption[]
  salespeople: { id: string; label: string }[]
  stores: { id: string; label: string }[]
  identity: Identity | null
  defaultBrandId: string
  suggestedNumber: string
}) {
  const router = useRouter()
  const today = new Date().toISOString().slice(0, 10)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [head, setHead] = useState({
    brand_id: defaultBrandId,
    delivery_note_no: suggestedNumber,
    week_start: weekStart(today),
    week_end: addDays(weekStart(today), 6),
    salesperson_id: '',
    sales_team: '',
    vehicle_route: '',
    source_store_id: '',
    notes: '',
  })
  const [lines, setLines] = useState<Line[]>([blankLine()])

  const set = <K extends keyof typeof head>(k: K, v: (typeof head)[K]) => setHead((c) => ({ ...c, [k]: v }))
  const setLine = (idx: number, patch: Partial<Line>) =>
    setLines((c) => c.map((l, i) => (i === idx ? { ...l, ...patch } : l)))

  const totalUnits = lines.reduce((s, l) => s + Number(l.quantity_issued || 0), 0)
  const totalValue = lines.reduce((s, l) => s + Number(l.quantity_issued || 0) * Number(l.selling_price_ksh || 0), 0)

  function shortfall(l: Line): string | null {
    if (!l.item_id) return null
    const item = items.find((i) => i.id === l.item_id)
    if (!item || item.onHand == null) return null
    const want = Number(l.quantity_issued || 0)
    return want > item.onHand ? `Only ${item.onHand} ${item.unit} on hand — this will be refused.` : null
  }

  async function submit(issue: boolean) {
    setError(''); setDone('')
    const usable = lines.filter((l) => l.item_id && Number(l.quantity_issued) > 0)
    if (usable.length === 0) { setError('Add at least one item with a quantity.'); return }
    if (!head.salesperson_id) { setError('Choose the salesperson taking custody.'); return }

    setSaving(true)
    const { ok, data } = await api<{ error?: string; row?: { id: string; allocation_ref: string; delivery_note_no: string } }>('/api/field-sales', {
      method: 'POST',
      body: JSON.stringify({
        action: 'create-allocation',
        ...head,
        source_store_id: head.source_store_id || null,
        lines: usable.map((l) => ({
          item_id: l.item_id,
          quantity_issued: Number(l.quantity_issued),
          unit: l.unit,
          selling_price_ksh: Number(l.selling_price_ksh || 0),
          batch_number: l.batch_number,
        })),
      }),
    })
    if (!ok) { setSaving(false); setError(data?.error ?? 'Could not save the delivery note.'); return }

    const row = data.row
    if (issue && row?.id) {
      const issued = await api<{ error?: string }>('/api/field-sales', {
        method: 'POST',
        body: JSON.stringify({ action: 'issue-allocation', id: row.id }),
      })
      setSaving(false)
      if (!issued.ok) { setError(issued.data?.error ?? 'Saved as draft, but issuing failed.'); return }
      setDone(`${row.delivery_note_no || row.allocation_ref} issued — ${totalUnits} unit(s) moved from the store into custody.`)
    } else {
      setSaving(false)
      setDone(`${row?.delivery_note_no || row?.allocation_ref} saved as a draft. Nothing has moved yet.`)
    }
    setLines([blankLine()])
    router.refresh()
  }

  return (
    <Pad title="Delivery Note" identity={identity}
      subtitle="Weekly stock handed to a sales team — opens their custody">
      <PadHeader>
        {brands.length > 1 && (
          <PadField label="Brand">
            <select className="input" value={head.brand_id} onChange={(e) => set('brand_id', e.target.value)}>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
          </PadField>
        )}
        <PadField label="D/Note no.">
          <input className="input" value={head.delivery_note_no} onChange={(e) => set('delivery_note_no', e.target.value)}
            placeholder="Number on the pad" />
        </PadField>
        <PadField label="Week starting">
          <input type="date" className="input" value={head.week_start}
            onChange={(e) => setHead((c) => ({ ...c, week_start: e.target.value, week_end: addDays(e.target.value, 6) }))} />
        </PadField>
        <PadField label="Week ending">
          <input type="date" className="input" value={head.week_end} onChange={(e) => set('week_end', e.target.value)} />
        </PadField>
        <PadField label="Salesperson">
          <select className="input" value={head.salesperson_id} onChange={(e) => set('salesperson_id', e.target.value)}>
            <option value="">Select…</option>
            {salespeople.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </PadField>
        <PadField label="Sales team">
          <input className="input" value={head.sales_team} onChange={(e) => set('sales_team', e.target.value)} />
        </PadField>
        <PadField label="Vehicle / route">
          <input className="input" value={head.vehicle_route} onChange={(e) => set('vehicle_route', e.target.value)} />
        </PadField>
        {stores.length > 0 && (
          <PadField label="From store">
            <select className="input" value={head.source_store_id} onChange={(e) => set('source_store_id', e.target.value)}>
              <option value="">Default</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </PadField>
        )}
      </PadHeader>

      <PadLines
        rows={lines.length}
        onAdd={() => setLines((c) => [...c, blankLine()])}
        columns={[
          { label: 'Item' },
          { label: 'Quantity', width: '12%', align: 'right' },
          { label: 'Unit', width: '9%' },
          { label: 'Selling price', width: '13%', align: 'right' },
          { label: 'Batch', width: '12%' },
          { label: 'Value', width: '13%', align: 'right' },
        ]}
      >
        {lines.map((l, idx) => {
          const short = shortfall(l)
          const value = Number(l.quantity_issued || 0) * Number(l.selling_price_ksh || 0)
          return (
            <>
              <PadRow key={idx} onRemove={lines.length > 1 ? () => setLines((c) => c.filter((_, i) => i !== idx)) : undefined}>
                <PadCell>
                  <select className="input" value={l.item_id}
                    onChange={(e) => {
                      const item = items.find((i) => i.id === e.target.value)
                      setLine(idx, { item_id: e.target.value, unit: item?.unit ?? l.unit })
                    }}>
                    <option value="">Select…</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>{i.label}{i.onHand != null ? ` · ${i.onHand} ${i.unit}` : ''}</option>
                    ))}
                  </select>
                </PadCell>
                <PadCell align="right">
                  <input type="number" step="any" min="0" className="input text-right" value={l.quantity_issued}
                    onChange={(e) => setLine(idx, { quantity_issued: e.target.value })} />
                </PadCell>
                <PadCell><input className="input" value={l.unit} onChange={(e) => setLine(idx, { unit: e.target.value })} /></PadCell>
                <PadCell align="right">
                  <input type="number" step="any" min="0" className="input text-right" value={l.selling_price_ksh}
                    onChange={(e) => setLine(idx, { selling_price_ksh: e.target.value })} />
                </PadCell>
                <PadCell><input className="input" value={l.batch_number} onChange={(e) => setLine(idx, { batch_number: e.target.value })} /></PadCell>
                <PadCell align="right">
                  <span className="px-1 text-sm tabular-nums text-gray-600">
                    {value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                </PadCell>
              </PadRow>
              {short && (
                <tr key={`${idx}-short`}>
                  <td colSpan={7} className="px-1.5 pb-2 text-xs text-amber-600">{short}</td>
                </tr>
              )}
            </>
          )
        })}
      </PadLines>

      <PadFooter fields={[
        { label: 'Notes', node: <input className="input" value={head.notes} onChange={(e) => set('notes', e.target.value)} /> },
      ]} />

      <StockEffectNotice tone="out">
        Issuing this note does two things, <strong>once each</strong>: it removes{' '}
        <strong>{totalUnits}</strong> unit(s) (KSh {totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })})
        from the store, and it opens that much custody for the salesperson.
        Daily sales then reduce <strong>custody only</strong> — the store is never deducted twice for
        the same goods.
      </StockEffectNotice>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      {done && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{done}</p>}

      <div className="flex flex-wrap gap-2">
        <button onClick={() => submit(true)} disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
          <Truck size={15} /> {saving ? 'Saving…' : 'Issue & hand over custody'}
        </button>
        <button onClick={() => submit(false)} disabled={saving}
          className="rounded-lg border border-gray-200 bg-white px-5 py-2 text-sm text-gray-600 hover:border-gray-300 disabled:opacity-60">
          Save as draft
        </button>
      </div>
    </Pad>
  )
}

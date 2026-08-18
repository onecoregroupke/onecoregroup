'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PackageCheck } from 'lucide-react'
import { api } from '@/lib/apiClient'
import { Pad, PadHeader, PadField, PadLines, PadRow, PadCell, PadFooter, StockEffectNotice } from './PadForm'

export interface ItemOption { id: string; label: string; unit: string; onHand?: number }
export interface VendorOption { id: string; label: string }
export interface Identity { name: string; lines: string[] }

interface Line {
  inventory_item_id: string
  description: string
  unit: string
  quantity_ordered: string
  quantity_delivered: string
  quantity_accepted: string
  quantity_rejected: string
  unit_cost_ksh: string
  condition: string
  rejection_reason: string
  batch_number: string
  disposition: string
}

const blankLine = (): Line => ({
  inventory_item_id: '', description: '', unit: 'pcs',
  quantity_ordered: '', quantity_delivered: '', quantity_accepted: '', quantity_rejected: '0',
  unit_cost_ksh: '', condition: 'good', rejection_reason: '', batch_number: '', disposition: 'stock',
})

/**
 * GOODS RECEIVED NOTE — every field as printed on the pad:
 * DATE · D/NO. · L.P.O. · GRN NO. · VEHICLE NO. · TIME · RECEIVED BY · SIGN ·
 * SUPPLIER · [QUANTITY | DESCRIPTION] · IN WORDS · REMARKS · AUTHORISED BY ·
 * ENTERED BY · STOCK CARD NO. · CHECKED BY
 *
 * The pad has one QUANTITY column. The digital form splits it into ordered,
 * delivered, accepted and rejected, because "the full ordered quantity was
 * stocked" is precisely how rejected goods used to inflate inventory. Only the
 * ACCEPTED quantity ever reaches stock, and delivered must equal accepted plus
 * rejected — enforced in the service, not just here.
 */
export function GoodsReceivedNoteForm({
  brands, items, vendors, identity, defaultBrandId,
}: {
  brands: { id: string; label: string }[]
  items: ItemOption[]
  vendors: VendorOption[]
  identity: Identity | null
  defaultBrandId: string
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [head, setHead] = useState({
    brand_id: defaultBrandId,
    received_date: new Date().toISOString().slice(0, 10),
    received_time: '',
    delivery_note_number: '',
    lpo_number: '',
    invoice_number: '',
    vehicle_number: '',
    vendor_id: '',
    received_by: '',
    delivery_person: '',
    receiving_location: '',
    stock_card_number: '',
    amount_in_words: '',
    remarks: '',
    authorised_by: '',
    entered_by: '',
    checked_by: '',
  })
  const [lines, setLines] = useState<Line[]>([blankLine()])

  const set = <K extends keyof typeof head>(k: K, v: (typeof head)[K]) => setHead((c) => ({ ...c, [k]: v }))
  const setLine = (idx: number, patch: Partial<Line>) =>
    setLines((c) => c.map((l, i) => (i === idx ? { ...l, ...patch } : l)))

  const acceptedTotal = lines.reduce((s, l) => s + Number(l.quantity_accepted || 0), 0)
  const rejectedTotal = lines.reduce((s, l) => s + Number(l.quantity_rejected || 0), 0)
  const stockable = lines.filter((l) => l.disposition === 'stock' && l.inventory_item_id)
    .reduce((s, l) => s + Number(l.quantity_accepted || 0), 0)

  /** Mirrors the service rule so the problem is visible before submitting. */
  function lineProblem(l: Line): string | null {
    const delivered = Number(l.quantity_delivered || 0)
    const accepted = Number(l.quantity_accepted || 0)
    const rejected = Number(l.quantity_rejected || 0)
    if (delivered <= 0) return null
    if (Math.abs(delivered - (accepted + rejected)) > 0.0001) {
      return `Delivered ${delivered} must equal accepted ${accepted} + rejected ${rejected}.`
    }
    if (rejected > 0 && !l.rejection_reason.trim()) return 'A rejection needs a reason.'
    return null
  }

  async function submit(post: boolean) {
    setError('')
    setDone('')
    const usable = lines.filter((l) => (l.description.trim() || l.inventory_item_id) && Number(l.quantity_delivered) > 0)
    if (usable.length === 0) { setError('Add at least one line with a delivered quantity.'); return }
    const problem = usable.map(lineProblem).find(Boolean)
    if (problem) { setError(problem); return }

    setSaving(true)
    const { ok, data } = await api<{ error?: string; receipt?: { id: string; reference: string } }>('/api/procurement/chain', {
      method: 'POST',
      body: JSON.stringify({
        action: 'create-receipt',
        ...head,
        vendor_id: head.vendor_id || null,
        items: usable.map((l) => ({
          inventory_item_id: l.inventory_item_id || null,
          description: l.description,
          unit: l.unit,
          quantity_ordered: Number(l.quantity_ordered || 0),
          quantity_delivered: Number(l.quantity_delivered || 0),
          quantity_accepted: Number(l.quantity_accepted || 0),
          quantity_rejected: Number(l.quantity_rejected || 0),
          unit_cost_ksh: Number(l.unit_cost_ksh || 0),
          batch_number: l.batch_number,
          condition: l.condition,
          rejection_reason: l.rejection_reason,
          disposition: l.disposition,
        })),
      }),
    })
    if (!ok) { setSaving(false); setError(data?.error ?? 'Could not save the note.'); return }

    const receipt = data.receipt
    if (post && receipt?.id) {
      const posted = await api<{ error?: string }>('/api/procurement/chain', {
        method: 'POST',
        body: JSON.stringify({ action: 'post-receipt', id: receipt.id }),
      })
      setSaving(false)
      if (!posted.ok) { setError(posted.data?.error ?? 'Saved as draft, but posting to stock failed.'); return }
      setDone(`${receipt.reference} posted — ${stockable} unit(s) added to stock.`)
    } else {
      setSaving(false)
      setDone(`${receipt?.reference ?? 'Note'} saved as a draft. Stock has NOT moved yet.`)
    }
    setLines([blankLine()])
    router.refresh()
  }

  return (
    <Pad title="Goods Received Note" identity={identity}
      subtitle="Goods arriving into a store from a supplier">
      <PadHeader>
        {brands.length > 1 && (
          <PadField label="Brand">
            <select className="input" value={head.brand_id} onChange={(e) => set('brand_id', e.target.value)}>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
          </PadField>
        )}
        <PadField label="Date">
          <input type="date" className="input" value={head.received_date} onChange={(e) => set('received_date', e.target.value)} />
        </PadField>
        <PadField label="Time">
          <input type="time" className="input" value={head.received_time} onChange={(e) => set('received_time', e.target.value)} />
        </PadField>
        <PadField label="D/No.">
          <input className="input" value={head.delivery_note_number} onChange={(e) => set('delivery_note_number', e.target.value)}
            placeholder="Supplier's delivery note" />
        </PadField>
        <PadField label="L.P.O.">
          <input className="input" value={head.lpo_number} onChange={(e) => set('lpo_number', e.target.value)} />
        </PadField>
        <PadField label="Invoice no.">
          <input className="input" value={head.invoice_number} onChange={(e) => set('invoice_number', e.target.value)} />
        </PadField>
        <PadField label="Vehicle no.">
          <input className="input" value={head.vehicle_number} onChange={(e) => set('vehicle_number', e.target.value)} />
        </PadField>
        <PadField label="Supplier">
          <select className="input" value={head.vendor_id} onChange={(e) => set('vendor_id', e.target.value)}>
            <option value="">Select…</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </PadField>
        <PadField label="Received by">
          <input className="input" value={head.received_by} onChange={(e) => set('received_by', e.target.value)} />
        </PadField>
        <PadField label="Delivered by">
          <input className="input" value={head.delivery_person} onChange={(e) => set('delivery_person', e.target.value)} />
        </PadField>
        <PadField label="Receiving location">
          <input className="input" value={head.receiving_location} onChange={(e) => set('receiving_location', e.target.value)} />
        </PadField>
        <PadField label="Stock card no.">
          <input className="input" value={head.stock_card_number} onChange={(e) => set('stock_card_number', e.target.value)}
            placeholder="Manual book folio" />
        </PadField>
      </PadHeader>

      <PadLines
        rows={lines.length}
        onAdd={() => setLines((c) => [...c, blankLine()])}
        columns={[
          { label: 'Description' },
          { label: 'Item', width: '15%' },
          { label: 'Unit', width: '7%' },
          { label: 'Ordered', width: '8%', align: 'right' },
          { label: 'Delivered', width: '8%', align: 'right' },
          { label: 'Accepted', width: '8%', align: 'right' },
          { label: 'Rejected', width: '8%', align: 'right' },
          { label: 'Unit cost', width: '9%', align: 'right' },
          { label: 'Batch', width: '9%' },
        ]}
      >
        {lines.map((l, idx) => {
          const problem = lineProblem(l)
          return (
            <>
              <PadRow key={idx} onRemove={lines.length > 1 ? () => setLines((c) => c.filter((_, i) => i !== idx)) : undefined}>
                <PadCell>
                  <input className="input" value={l.description} placeholder="As written on the note"
                    onChange={(e) => setLine(idx, { description: e.target.value })} />
                </PadCell>
                <PadCell>
                  <select className="input" value={l.inventory_item_id}
                    onChange={(e) => {
                      const item = items.find((i) => i.id === e.target.value)
                      setLine(idx, {
                        inventory_item_id: e.target.value,
                        unit: item?.unit ?? l.unit,
                        description: l.description || (item?.label ?? ''),
                      })
                    }}>
                    <option value="">Not stocked</option>
                    {items.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
                  </select>
                </PadCell>
                <PadCell><input className="input" value={l.unit} onChange={(e) => setLine(idx, { unit: e.target.value })} /></PadCell>
                <PadCell align="right">
                  <input type="number" step="any" min="0" className="input text-right" value={l.quantity_ordered}
                    onChange={(e) => setLine(idx, { quantity_ordered: e.target.value })} />
                </PadCell>
                <PadCell align="right">
                  <input type="number" step="any" min="0" className="input text-right" value={l.quantity_delivered}
                    onChange={(e) => {
                      // Default accepted to delivered — the common case is that
                      // everything is good. Rejecting is the deliberate act.
                      const rejected = Number(l.quantity_rejected || 0)
                      const delivered = Number(e.target.value || 0)
                      setLine(idx, {
                        quantity_delivered: e.target.value,
                        quantity_accepted: String(Math.max(0, delivered - rejected)),
                      })
                    }} />
                </PadCell>
                <PadCell align="right">
                  <input type="number" step="any" min="0" className="input text-right" value={l.quantity_accepted}
                    onChange={(e) => setLine(idx, { quantity_accepted: e.target.value })} />
                </PadCell>
                <PadCell align="right">
                  <input type="number" step="any" min="0" className="input text-right" value={l.quantity_rejected}
                    onChange={(e) => {
                      const delivered = Number(l.quantity_delivered || 0)
                      const rejected = Number(e.target.value || 0)
                      setLine(idx, {
                        quantity_rejected: e.target.value,
                        quantity_accepted: String(Math.max(0, delivered - rejected)),
                      })
                    }} />
                </PadCell>
                <PadCell align="right">
                  <input type="number" step="any" min="0" className="input text-right" value={l.unit_cost_ksh}
                    onChange={(e) => setLine(idx, { unit_cost_ksh: e.target.value })} />
                </PadCell>
                <PadCell>
                  <input className="input" value={l.batch_number} onChange={(e) => setLine(idx, { batch_number: e.target.value })} />
                </PadCell>
              </PadRow>
              {Number(l.quantity_rejected || 0) > 0 && (
                <tr key={`${idx}-reject`}>
                  <td colSpan={10} className="px-1.5 pb-2">
                    <input className="input" placeholder="Reason for rejection (required)"
                      value={l.rejection_reason} onChange={(e) => setLine(idx, { rejection_reason: e.target.value })} />
                  </td>
                </tr>
              )}
              {problem && (
                <tr key={`${idx}-problem`}>
                  <td colSpan={10} className="px-1.5 pb-2 text-xs text-red-600">{problem}</td>
                </tr>
              )}
            </>
          )
        })}
      </PadLines>

      <div className="grid gap-3 sm:grid-cols-2">
        <PadField label="In words">
          <input className="input" value={head.amount_in_words} onChange={(e) => set('amount_in_words', e.target.value)} />
        </PadField>
        <PadField label="Remarks">
          <input className="input" value={head.remarks} onChange={(e) => set('remarks', e.target.value)} />
        </PadField>
      </div>

      <PadFooter fields={[
        { label: 'Authorised by', node: <input className="input" value={head.authorised_by} onChange={(e) => set('authorised_by', e.target.value)} /> },
        { label: 'Entered by', node: <input className="input" value={head.entered_by} onChange={(e) => set('entered_by', e.target.value)} /> },
        { label: 'Checked by', node: <input className="input" value={head.checked_by} onChange={(e) => set('checked_by', e.target.value)} /> },
      ]} />

      <StockEffectNotice tone="in">
        Posting this note adds <strong>{stockable}</strong> unit(s) to stock — the accepted quantity of
        lines linked to a stocked item only.
        {rejectedTotal > 0 && <> The <strong>{rejectedTotal}</strong> rejected unit(s) are recorded on the note and never reach inventory.</>}
        {acceptedTotal > stockable && <> Lines marked “not stocked” or for immediate consumption add nothing.</>}
      </StockEffectNotice>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      {done && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{done}</p>}

      <div className="flex flex-wrap gap-2">
        <button onClick={() => submit(true)} disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
          <PackageCheck size={15} /> {saving ? 'Saving…' : 'Receive & post to stock'}
        </button>
        <button onClick={() => submit(false)} disabled={saving}
          className="rounded-lg border border-gray-200 bg-white px-5 py-2 text-sm text-gray-600 hover:border-gray-300 disabled:opacity-60">
          Save as draft
        </button>
      </div>
    </Pad>
  )
}

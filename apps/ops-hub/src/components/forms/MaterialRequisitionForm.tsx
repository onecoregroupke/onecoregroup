'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList } from 'lucide-react'
import { api } from '@/lib/apiClient'
import { Pad, PadHeader, PadField, PadLines, PadRow, PadCell, PadFooter, StockEffectNotice } from './PadForm'
import type { ItemOption, Identity } from './GoodsReceivedNoteForm'

interface Line {
  inventory_item_id: string
  description: string
  unit: string
  quantity_requested: string
  notes: string
}

const blankLine = (): Line => ({ inventory_item_id: '', description: '', unit: 'pcs', quantity_requested: '', notes: '' })

/**
 * MATERIAL REQUISITION FORM — the pad prints:
 * DATE · NO. · [SR. No. | ITEMS | QUANTITY] · Prepared by + Date · Authorised by + Date
 *
 * A requisition ASKS for material. It moves no stock at all — not when raised,
 * and not when approved. Stock moves only when the resulting Goods Issue Note
 * is posted. That separation is the point: an approval is a decision, not a
 * movement, and conflating the two is how stores lose track of what is actually
 * on the shelf.
 */
export function MaterialRequisitionForm({
  brands, items, identity, defaultBrandId,
}: {
  brands: { id: string; label: string }[]
  items: ItemOption[]
  identity: Identity | null
  defaultBrandId: string
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [head, setHead] = useState({
    brand_id: defaultBrandId,
    requested_date: new Date().toISOString().slice(0, 10),
    requisition_number: '',
    department: '',
    purpose: '',
    required_by: '',
    prepared_by: '',
    notes: '',
  })
  const [lines, setLines] = useState<Line[]>([blankLine()])

  const set = <K extends keyof typeof head>(k: K, v: (typeof head)[K]) => setHead((c) => ({ ...c, [k]: v }))
  const setLine = (idx: number, patch: Partial<Line>) =>
    setLines((c) => c.map((l, i) => (i === idx ? { ...l, ...patch } : l)))

  async function submit(submitForApproval: boolean) {
    setError(''); setDone('')
    const usable = lines.filter((l) => (l.description.trim() || l.inventory_item_id) && Number(l.quantity_requested) > 0)
    if (usable.length === 0) { setError('Add at least one item with a quantity.'); return }

    setSaving(true)
    const { ok, data } = await api<{ error?: string; requisition?: { id: string; reference: string } }>('/api/procurement/chain', {
      method: 'POST',
      body: JSON.stringify({
        action: 'create-requisition',
        ...head,
        items: usable.map((l) => ({
          inventory_item_id: l.inventory_item_id || null,
          description: l.description,
          unit: l.unit,
          quantity_requested: Number(l.quantity_requested || 0),
          notes: l.notes,
        })),
      }),
    })
    if (!ok) { setSaving(false); setError(data?.error ?? 'Could not save the requisition.'); return }

    const req = data.requisition
    if (submitForApproval && req?.id) {
      const sent = await api<{ error?: string }>('/api/procurement/chain', {
        method: 'POST',
        body: JSON.stringify({ action: 'submit-requisition', id: req.id }),
      })
      setSaving(false)
      if (!sent.ok) { setError(sent.data?.error ?? 'Saved, but could not submit for approval.'); return }
      setDone(`${req.reference} submitted for approval.`)
    } else {
      setSaving(false)
      setDone(`${req?.reference ?? 'Requisition'} saved as a draft.`)
    }
    setLines([blankLine()])
    router.refresh()
  }

  return (
    <Pad title="Material Requisition Form" identity={identity}
      subtitle="A request for material — no stock moves until the issue note is posted">
      <PadHeader>
        {brands.length > 1 && (
          <PadField label="Brand">
            <select className="input" value={head.brand_id} onChange={(e) => set('brand_id', e.target.value)}>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
          </PadField>
        )}
        <PadField label="Date">
          <input type="date" className="input" value={head.requested_date} onChange={(e) => set('requested_date', e.target.value)} />
        </PadField>
        <PadField label="No.">
          <input className="input" value={head.requisition_number} onChange={(e) => set('requisition_number', e.target.value)}
            placeholder="Number on the pad" />
        </PadField>
        <PadField label="Department">
          <input className="input" value={head.department} onChange={(e) => set('department', e.target.value)} />
        </PadField>
        <PadField label="Required by">
          <input type="date" className="input" value={head.required_by} onChange={(e) => set('required_by', e.target.value)} />
        </PadField>
        <PadField label="Purpose" className="lg:col-span-2">
          <input className="input" value={head.purpose} onChange={(e) => set('purpose', e.target.value)} />
        </PadField>
      </PadHeader>

      <PadLines
        rows={lines.length}
        onAdd={() => setLines((c) => [...c, blankLine()])}
        columns={[
          { label: 'Sr. no.', width: '7%' },
          { label: 'Items' },
          { label: 'Stocked item', width: '22%' },
          { label: 'Unit', width: '9%' },
          { label: 'Quantity', width: '11%', align: 'right' },
          { label: 'Notes', width: '18%' },
        ]}
      >
        {lines.map((l, idx) => (
          <PadRow key={idx} onRemove={lines.length > 1 ? () => setLines((c) => c.filter((_, i) => i !== idx)) : undefined}>
            <PadCell><span className="px-1 text-sm text-gray-500">{idx + 1}</span></PadCell>
            <PadCell>
              <input className="input" value={l.description} placeholder="As written on the form"
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
                <option value="">Not in the register</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}{i.onHand != null ? ` · ${i.onHand} ${i.unit}` : ''}
                  </option>
                ))}
              </select>
            </PadCell>
            <PadCell><input className="input" value={l.unit} onChange={(e) => setLine(idx, { unit: e.target.value })} /></PadCell>
            <PadCell align="right">
              <input type="number" step="any" min="0" className="input text-right" value={l.quantity_requested}
                onChange={(e) => setLine(idx, { quantity_requested: e.target.value })} />
            </PadCell>
            <PadCell><input className="input" value={l.notes} onChange={(e) => setLine(idx, { notes: e.target.value })} /></PadCell>
          </PadRow>
        ))}
      </PadLines>

      <PadFooter fields={[
        { label: 'Prepared by', node: <input className="input" value={head.prepared_by} onChange={(e) => set('prepared_by', e.target.value)} /> },
        { label: 'Notes', node: <input className="input" value={head.notes} onChange={(e) => set('notes', e.target.value)} /> },
      ]} />

      <StockEffectNotice tone="none">
        <strong>This form moves no stock.</strong> It records a request. Approval is recorded
        separately, by someone other than the requester — a requester can never approve their own
        requisition — and stock only moves when the resulting Goods Issue Note is posted.
      </StockEffectNotice>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      {done && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{done}</p>}

      <div className="flex flex-wrap gap-2">
        <button onClick={() => submit(true)} disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
          <ClipboardList size={15} /> {saving ? 'Saving…' : 'Submit for approval'}
        </button>
        <button onClick={() => submit(false)} disabled={saving}
          className="rounded-lg border border-gray-200 bg-white px-5 py-2 text-sm text-gray-600 hover:border-gray-300 disabled:opacity-60">
          Save as draft
        </button>
      </div>
    </Pad>
  )
}

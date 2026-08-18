'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PackageMinus } from 'lucide-react'
import { api } from '@/lib/apiClient'
import { Pad, PadHeader, PadField, PadLines, PadRow, PadCell, PadFooter, StockEffectNotice } from './PadForm'
import type { ItemOption, Identity } from './GoodsReceivedNoteForm'

interface Line {
  inventory_item_id: string
  description: string
  unit: string
  quantity_issued: string
  batch_number: string
  store_location: string
  remarks: string
}

const blankLine = (): Line => ({
  inventory_item_id: '', description: '', unit: 'pcs',
  quantity_issued: '', batch_number: '', store_location: '', remarks: '',
})

/**
 * GOODS / RAW MATERIAL ISSUE NOTE and GOODS TRANSFER NOTE.
 *
 * Two pads, one form, because they differ only in who the counterparty is:
 *   GIN — GIN NO. · Issued to · Date · [QUANTITY | DESCRIPTION | REMARKS] ·
 *         Stock Card entered by · Issued by · Received by
 *   GTN — GTN NO. · Transferred To · Date · [same lines] ·
 *         Stock Card entered by · Goods Issued by · Goods Received by
 *
 * Both take stock OUT of a store. The service refuses an issue larger than what
 * is on hand, so this cannot drive a store negative.
 */
export function GoodsIssueNoteForm({
  kind, brands, items, identity, defaultBrandId,
}: {
  kind: 'issue' | 'transfer'
  brands: { id: string; label: string }[]
  items: ItemOption[]
  identity: Identity | null
  defaultBrandId: string
}) {
  const router = useRouter()
  const isTransfer = kind === 'transfer'
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [head, setHead] = useState({
    brand_id: defaultBrandId,
    issue_date: new Date().toISOString().slice(0, 10),
    issued_to: '',
    department: '',
    destination_location: '',
    purpose: '',
    stock_card_number: '',
    issued_by: '',
    received_by: '',
    entered_by: '',
    remarks: '',
  })
  const [lines, setLines] = useState<Line[]>([blankLine()])

  const set = <K extends keyof typeof head>(k: K, v: (typeof head)[K]) => setHead((c) => ({ ...c, [k]: v }))
  const setLine = (idx: number, patch: Partial<Line>) =>
    setLines((c) => c.map((l, i) => (i === idx ? { ...l, ...patch } : l)))

  const totalOut = lines.filter((l) => l.inventory_item_id)
    .reduce((s, l) => s + Number(l.quantity_issued || 0), 0)

  /** On-hand check mirrored from the ledger so a short issue is visible early. */
  function shortfall(l: Line): string | null {
    if (!l.inventory_item_id) return null
    const item = items.find((i) => i.id === l.inventory_item_id)
    if (!item) return null
    const want = Number(l.quantity_issued || 0)
    if (want > 0 && item.onHand != null && want > item.onHand) {
      return `Only ${item.onHand} ${item.unit} on hand — this issue will be refused.`
    }
    return null
  }

  async function submit(post: boolean) {
    setError(''); setDone('')
    const usable = lines.filter((l) => (l.description.trim() || l.inventory_item_id) && Number(l.quantity_issued) > 0)
    if (usable.length === 0) { setError('Add at least one line with a quantity.'); return }
    if (!head.issued_to.trim()) {
      setError(isTransfer ? 'Say where the goods are being transferred to.' : 'Say who the goods are being issued to.')
      return
    }

    setSaving(true)
    const { ok, data } = await api<{ error?: string; issue?: { id: string; reference: string } }>('/api/procurement/chain', {
      method: 'POST',
      body: JSON.stringify({
        action: 'create-issue',
        kind,
        ...head,
        items: usable.map((l) => ({
          inventory_item_id: l.inventory_item_id || null,
          description: l.description,
          unit: l.unit,
          quantity_issued: Number(l.quantity_issued || 0),
          batch_number: l.batch_number,
          store_location: l.store_location,
          remarks: l.remarks,
        })),
      }),
    })
    if (!ok) { setSaving(false); setError(data?.error ?? 'Could not save the note.'); return }

    const issue = data.issue
    if (post && issue?.id) {
      const posted = await api<{ error?: string }>('/api/procurement/chain', {
        method: 'POST',
        body: JSON.stringify({ action: 'post-issue', id: issue.id }),
      })
      setSaving(false)
      if (!posted.ok) { setError(posted.data?.error ?? 'Saved as draft, but posting to stock failed.'); return }
      setDone(`${issue.reference} posted — ${totalOut} unit(s) taken out of stock.`)
    } else {
      setSaving(false)
      setDone(`${issue?.reference ?? 'Note'} saved as a draft. Stock has NOT moved yet.`)
    }
    setLines([blankLine()])
    router.refresh()
  }

  return (
    <Pad
      title={isTransfer ? 'Goods Transfer Note' : 'Goods / Raw Material Issue Note'}
      identity={identity}
      subtitle={isTransfer ? 'Stock moving between stores' : 'Stock issued to production or a department'}
    >
      <PadHeader>
        {brands.length > 1 && (
          <PadField label="Brand">
            <select className="input" value={head.brand_id} onChange={(e) => set('brand_id', e.target.value)}>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
          </PadField>
        )}
        <PadField label="Date">
          <input type="date" className="input" value={head.issue_date} onChange={(e) => set('issue_date', e.target.value)} />
        </PadField>
        <PadField label={isTransfer ? 'Transferred to' : 'Issued to'}>
          <input className="input" value={head.issued_to} onChange={(e) => set('issued_to', e.target.value)} />
        </PadField>
        <PadField label="Department">
          <input className="input" value={head.department} onChange={(e) => set('department', e.target.value)} />
        </PadField>
        {isTransfer && (
          <PadField label="Destination store">
            <input className="input" value={head.destination_location} onChange={(e) => set('destination_location', e.target.value)} />
          </PadField>
        )}
        <PadField label="Purpose">
          <input className="input" value={head.purpose} onChange={(e) => set('purpose', e.target.value)} />
        </PadField>
        <PadField label="Stock card no.">
          <input className="input" value={head.stock_card_number} onChange={(e) => set('stock_card_number', e.target.value)} />
        </PadField>
      </PadHeader>

      <PadLines
        rows={lines.length}
        onAdd={() => setLines((c) => [...c, blankLine()])}
        columns={[
          { label: 'Quantity', width: '11%', align: 'right' },
          { label: 'Description' },
          { label: 'Item', width: '20%' },
          { label: 'Unit', width: '8%' },
          { label: 'Batch', width: '11%' },
          { label: 'Remarks', width: '18%' },
        ]}
      >
        {lines.map((l, idx) => {
          const short = shortfall(l)
          return (
            <>
              <PadRow key={idx} onRemove={lines.length > 1 ? () => setLines((c) => c.filter((_, i) => i !== idx)) : undefined}>
                <PadCell align="right">
                  <input type="number" step="any" min="0" className="input text-right" value={l.quantity_issued}
                    onChange={(e) => setLine(idx, { quantity_issued: e.target.value })} />
                </PadCell>
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
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.label}{i.onHand != null ? ` · ${i.onHand} ${i.unit}` : ''}
                      </option>
                    ))}
                  </select>
                </PadCell>
                <PadCell><input className="input" value={l.unit} onChange={(e) => setLine(idx, { unit: e.target.value })} /></PadCell>
                <PadCell><input className="input" value={l.batch_number} onChange={(e) => setLine(idx, { batch_number: e.target.value })} /></PadCell>
                <PadCell><input className="input" value={l.remarks} onChange={(e) => setLine(idx, { remarks: e.target.value })} /></PadCell>
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
        { label: 'Stock card entered by', node: <input className="input" value={head.entered_by} onChange={(e) => set('entered_by', e.target.value)} /> },
        { label: isTransfer ? 'Goods issued by' : 'Issued by', node: <input className="input" value={head.issued_by} onChange={(e) => set('issued_by', e.target.value)} /> },
        { label: isTransfer ? 'Goods received by' : 'Received by', node: <input className="input" value={head.received_by} onChange={(e) => set('received_by', e.target.value)} /> },
        { label: 'Remarks', node: <input className="input" value={head.remarks} onChange={(e) => set('remarks', e.target.value)} /> },
      ]} />

      <StockEffectNotice tone="out">
        Posting this note removes <strong>{totalOut}</strong> unit(s) from stock.
        {isTransfer
          ? ' A transfer is recorded as stock leaving the source store; the destination is named on the note.'
          : ' Material issued to production is consumed — it leaves the store and is reconciled against the run.'}
        {' '}An issue larger than the quantity on hand is refused by the ledger.
      </StockEffectNotice>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      {done && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{done}</p>}

      <div className="flex flex-wrap gap-2">
        <button onClick={() => submit(true)} disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
          <PackageMinus size={15} /> {saving ? 'Saving…' : 'Issue & post to stock'}
        </button>
        <button onClick={() => submit(false)} disabled={saving}
          className="rounded-lg border border-gray-200 bg-white px-5 py-2 text-sm text-gray-600 hover:border-gray-300 disabled:opacity-60">
          Save as draft
        </button>
      </div>
    </Pad>
  )
}

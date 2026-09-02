'use client'

import { Fragment, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PackageMinus } from 'lucide-react'
import { api } from '@/lib/apiClient'
import { inventoryOptionStockLabel } from '@/lib/finishedGoodsQuantity'
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
  kind, brands, items, stores, identity, defaultBrandId, productionRuns, defaultRunId,
}: {
  kind: 'issue' | 'transfer'
  brands: { id: string; label: string }[]
  items: ItemOption[]
  stores: { id: string; label: string }[]
  identity: Identity | null
  defaultBrandId: string
  productionRuns: { id: string; label: string; productItemId: string | null; acceptedQuantity: number }[]
  defaultRunId: string
}) {
  const router = useRouter()
  const isTransfer = kind === 'transfer'
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [head, setHead] = useState({
    brand_id: defaultBrandId,
    issue_date: new Date().toISOString().slice(0, 10),
    document_number: '',
    issued_to: '',
    department: '',
    destination_location: '',
    purpose: '',
    stock_card_number: '',
    source_store_id: '',
    destination_store_id: '',
    issued_by: '',
    received_by: '',
    entered_by: '',
    remarks: '',
    production_run_id: defaultRunId,
    exception_reason: '',
    requested_by_name: '',
    approved_by_name: '',
    prepared_by: '',
    handed_over_by: '',
  })
  const [lines, setLines] = useState<Line[]>([blankLine()])

  const set = <K extends keyof typeof head>(k: K, v: (typeof head)[K]) => setHead((c) => ({ ...c, [k]: v }))
  const setLine = (idx: number, patch: Partial<Line>) =>
    setLines((c) => c.map((l, i) => (i === idx ? { ...l, ...patch } : l)))

  const totalOut = lines.filter((l) => l.inventory_item_id)
    .reduce((s, l) => s + Number(l.quantity_issued || 0), 0)
  const selectedRun = productionRuns.find((run) => run.id === head.production_run_id)

  /** On-hand check mirrored from the ledger so a short issue is visible early. */
  function shortfall(l: Line): string | null {
    if (isTransfer && selectedRun) return null
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
    if (!head.document_number.trim()) { setError(`Enter the physical ${isTransfer ? 'GTN' : 'GIN'} number.`); return }
    if (!head.issued_to.trim()) {
      setError(isTransfer ? 'Say where the goods are being transferred to.' : 'Say who the goods are being issued to.')
      return
    }
    if (!isTransfer && [head.exception_reason, head.requested_by_name, head.approved_by_name, head.purpose]
      .some((value) => !value.trim())) {
      setError('This non-MRF issue is an exception. Record the reason, requester, approver, destination and intended use.')
      return
    }

    setSaving(true)
    const { ok, data } = await api<{ error?: string; issue?: { id: string; reference: string } }>('/api/procurement/chain', {
      method: 'POST',
      body: JSON.stringify({
        action: 'create-issue',
        values: {
          kind,
          brand_id: head.brand_id,
          issue_date: head.issue_date,
          document_number: head.document_number,
          issued_to_type: isTransfer ? 'store' : 'other',
          issued_to_label: head.issued_to,
          transfer_to_location: head.destination_location,
          store_location: stores.find((s) => s.id === head.source_store_id)?.label ?? '',
          source_store_id: head.source_store_id || null,
          destination_store_id: head.destination_store_id || null,
          department: head.department,
          purpose: head.purpose,
          production_run_id: head.production_run_id || null,
          exception_reason: head.exception_reason,
          requested_by: head.requested_by_name,
          requested_by_name: head.requested_by_name,
          approved_by: head.approved_by_name,
          approved_by_name: head.approved_by_name,
          prepared_by: head.prepared_by,
          handed_over_by: head.handed_over_by,
          stock_card_number: head.stock_card_number,
          entered_by: head.entered_by,
          issued_by: head.issued_by,
          received_by: head.received_by,
          remarks: head.remarks,
          items: usable.map((l) => ({
            inventory_item_id: l.inventory_item_id || null,
            description: l.description,
            unit: l.unit,
            quantity_approved: Number(l.quantity_issued || 0),
            quantity_issued: Number(l.quantity_issued || 0),
            batch_number: l.batch_number,
            store_location: l.store_location,
            remarks: l.remarks,
          })),
        },
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
      setDone(isTransfer && head.production_run_id
        ? `${issue.reference} posted — ${totalOut} accepted unit(s) received into the destination store.`
        : `${issue.reference} posted — ${totalOut} unit(s) moved by the document.`)
    } else {
      setSaving(false)
      setDone(`${issue?.reference ?? 'Note'} saved as a draft. Stock has NOT moved yet.`)
    }
    setLines([blankLine()])
    router.refresh()
  }

  return (
    <Pad
      title={isTransfer ? 'Goods Transfer Note' : 'Other Stock Issue (exception)'}
      identity={identity}
      subtitle={isTransfer ? 'Store-to-store transfer or accepted production receipt' : 'Use only when no approved Material Requisition exists'}
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
        <PadField label={isTransfer ? 'GTN no.' : 'GIN no.'}>
          <input className="input" value={head.document_number} onChange={(e) => set('document_number', e.target.value)} placeholder="Number on the physical pad" />
        </PadField>
        {isTransfer && productionRuns.length > 0 && (
          <PadField label="Production run (for production → FG)">
            <select className="input" value={head.production_run_id} onChange={(e) => set('production_run_id', e.target.value)}>
              <option value="">Ordinary store transfer</option>
              {productionRuns.map((run) => <option key={run.id} value={run.id}>{run.label} · accepted {run.acceptedQuantity}</option>)}
            </select>
          </PadField>
        )}
        {!isTransfer && (
          <>
            <PadField label="Exception reason"><input className="input" value={head.exception_reason} onChange={(e) => set('exception_reason', e.target.value)} /></PadField>
            <PadField label="Requested by"><input className="input" value={head.requested_by_name} onChange={(e) => set('requested_by_name', e.target.value)} /></PadField>
            <PadField label="Approved by"><input className="input" value={head.approved_by_name} onChange={(e) => set('approved_by_name', e.target.value)} /></PadField>
          </>
        )}
        <PadField label="Source store">
          <select className="input" value={head.source_store_id} onChange={(e) => set('source_store_id', e.target.value)}>
            <option value="">Select source store…</option>
            {stores.map((store) => <option key={store.id} value={store.id}>{store.label}</option>)}
          </select>
        </PadField>
        {isTransfer && (
          <>
            <PadField label="Destination store">
              <select className="input" value={head.destination_store_id} onChange={(e) => {
                const id = e.target.value
                setHead((current) => ({ ...current, destination_store_id: id, destination_location: stores.find((s) => s.id === id)?.label ?? '' }))
              }}>
                <option value="">Select destination store…</option>
                {stores.filter((store) => store.id !== head.source_store_id).map((store) => <option key={store.id} value={store.id}>{store.label}</option>)}
              </select>
            </PadField>
          </>
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
            <Fragment key={idx}>
              <PadRow onRemove={lines.length > 1 ? () => setLines((c) => c.filter((_, i) => i !== idx)) : undefined}>
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
                        {i.label}{i.onHand != null ? ` · ${inventoryOptionStockLabel(i)}` : ''}
                      </option>
                    ))}
                  </select>
                </PadCell>
                <PadCell><input className="input" value={l.unit} onChange={(e) => setLine(idx, { unit: e.target.value })} /></PadCell>
                <PadCell><input className="input" value={l.batch_number} onChange={(e) => setLine(idx, { batch_number: e.target.value })} /></PadCell>
                <PadCell><input className="input" value={l.remarks} onChange={(e) => setLine(idx, { remarks: e.target.value })} /></PadCell>
              </PadRow>
              {short && (
                <tr>
                  <td colSpan={7} className="px-1.5 pb-2 text-xs text-amber-600">{short}</td>
                </tr>
              )}
            </Fragment>
          )
        })}
      </PadLines>

      <PadFooter fields={[
        { label: 'Stock card entered by', node: <input className="input" value={head.entered_by} onChange={(e) => set('entered_by', e.target.value)} /> },
        { label: 'Prepared by', node: <input className="input" value={head.prepared_by} onChange={(e) => set('prepared_by', e.target.value)} /> },
        { label: 'Handed over by', node: <input className="input" value={head.handed_over_by} onChange={(e) => set('handed_over_by', e.target.value)} /> },
        { label: isTransfer ? 'Goods issued by' : 'Issued by', node: <input className="input" value={head.issued_by} onChange={(e) => set('issued_by', e.target.value)} /> },
        { label: isTransfer ? 'Goods received by' : 'Received by', node: <input className="input" value={head.received_by} onChange={(e) => set('received_by', e.target.value)} /> },
        { label: 'Remarks', node: <input className="input" value={head.remarks} onChange={(e) => set('remarks', e.target.value)} /> },
      ]} />

      <StockEffectNotice tone="out">
        Posting this note {isTransfer && selectedRun ? 'receives' : isTransfer ? 'moves' : 'removes'} <strong>{totalOut}</strong> unit(s) {isTransfer && selectedRun ? 'into finished-goods inventory' : isTransfer ? 'between stores' : 'from stock'}.
        {isTransfer && selectedRun
          ? ' Production output was not previously in inventory, so the linked GTN creates one destination receipt and no production-store deduction.'
          : isTransfer
            ? ' Paired source and destination ledger movements keep total stock unchanged and are protected against replay.'
            : ' This is an explicitly approved non-MRF exception. Normal production issues originate from an approved MRF.'}
        {!(isTransfer && selectedRun) && ' An issue larger than the quantity on hand is refused by the ledger.'}
      </StockEffectNotice>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      {done && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{done}</p>}

      <div className="flex flex-wrap gap-2">
        <button onClick={() => submit(true)} disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
          <PackageMinus size={15} /> {saving ? 'Saving…' : isTransfer ? 'Post GTN' : 'Post exception issue'}
        </button>
        <button onClick={() => submit(false)} disabled={saving}
          className="rounded-lg border border-gray-200 bg-white px-5 py-2 text-sm text-gray-600 hover:border-gray-300 disabled:opacity-60">
          Save as draft
        </button>
      </div>
    </Pad>
  )
}
